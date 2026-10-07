import { beforeEach, describe, expect, it } from "vitest";
import { analyzeDispute } from "../src/lib/agent";
import { paypal } from "../src/lib/paypal";
import { resetMock } from "../src/lib/paypal/mock";

process.env.PAYPAL_MODE = "mock";

// Scripted stand-in for Claude: replays tool calls, then submits.
function fakeClient(script: Array<Array<{ name: string; input: Record<string, unknown> }>>) {
  const calls: any[] = [];
  let i = 0;
  return {
    calls,
    create: async (params: any) => {
      calls.push(structuredClone(params));
      const uses = script[i++] ?? [];
      return {
        stop_reason: uses.length ? "tool_use" : "end_turn",
        content: uses.map((u, k) => ({ type: "tool_use", id: `tu_${i}_${k}`, name: u.name, input: u.input })),
      } as any;
    },
  };
}

const rec = {
  decision: "FIGHT", win_probability: 0.85, headline: "Fight it", rationale: "Signed delivery.",
  evidence: [{ type: "PROOF_OF_DELIVERY_SIGNATURE", summary: "Signed by WHITFIELD", source: "get_store_records" }],
  response_to_paypal: "Delivered and signed.", tracking_carrier: "UPS", tracking_number: "1Z84A9E70347215522",
  offer_amount: 0, offer_type: "NONE", risks: [],
};

describe("analyzeDispute", () => {
  beforeEach(() => resetMock());

  it("runs PayPal and store tools, then returns a validated recommendation", async () => {
    const [d] = await paypal().listDisputes();
    const txn = d.disputed_transactions[0];
    const orderId = await paypal().orderIdForInvoice(txn.invoice_number!);
    const client = fakeClient([
      [{ name: "get_dispute", input: { dispute_id: d.dispute_id } }, { name: "get_store_records", input: { invoice_id: txn.invoice_number } }],
      [{ name: "get_order", input: { id: orderId } }, { name: "get_shipment_tracking", input: { transaction_id: txn.seller_transaction_id } }],
      [{ name: "submit_recommendation", input: rec }],
    ]);
    const steps: string[] = [];
    const out = await analyzeDispute(d, { client: client as any, onStep: (s) => steps.push(s.summary) });

    expect(out.recommendation.decision).toBe("FIGHT");
    expect(out.trace.filter((t) => t.kind === "tool").map((t) => t.tool)).toEqual(["get_dispute", "get_store_records", "get_order", "get_shipment_tracking"]);
    expect(steps.join("\n")).toContain("PayPal tracker: UPS 1Z84A9E70347215522, status DELIVERED");
    // Both tool results from one turn go back in a single user message.
    const second = client.calls[1].messages.at(-1);
    expect(second.role).toBe("user");
    expect(second.content).toHaveLength(2);
    expect(client.calls[0].model).toBe("claude-opus-5-5");
    expect(client.calls[0].tools.map((t: any) => t.name)).toEqual(
      expect.arrayContaining(["get_dispute", "get_order", "get_shipment_tracking", "list_transactions", "get_store_records", "submit_recommendation"]),
    );
  });

  it("returns an invalid recommendation to the model as an error and accepts the retry", async () => {
    const [d] = await paypal().listDisputes();
    const client = fakeClient([
      [{ name: "submit_recommendation", input: { ...rec, win_probability: 7 } }],
      [{ name: "submit_recommendation", input: rec }],
    ]);
    const out = await analyzeDispute(d, { client: client as any });
    expect(out.recommendation.win_probability).toBe(0.85);
    const errResult = client.calls[1].messages.at(-1).content[0];
    expect(errResult.is_error).toBe(true);
  });

  it("reports tool failures to the model instead of crashing", async () => {
    const [d] = await paypal().listDisputes();
    const client = fakeClient([[{ name: "get_order", input: { id: "NOPE00000000000000" } }], [{ name: "submit_recommendation", input: rec }]]);
    const out = await analyzeDispute(d, { client: client as any });
    expect(out.trace[0].kind).toBe("error");
    expect(client.calls[1].messages.at(-1).content[0].is_error).toBe(true);
  });

  it("nudges once when the model stops without submitting, then fails", async () => {
    const [d] = await paypal().listDisputes();
    await expect(analyzeDispute(d, { client: fakeClient([[], []]) as any })).rejects.toThrow("without a recommendation");
  });
});
