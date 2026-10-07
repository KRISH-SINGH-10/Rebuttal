// DEVELOPMENT ONLY. A scripted stand-in for the AI model so the UI can be exercised
// without an API key (REBUTTAL_SCRIPTED_MODEL=1, never in production). It drives the
// real agent loop and real tools; only the model's choices are canned.

import { scenarioByKey } from "../demo/scenarios";

export function scriptedModel() {
  return {
    async create(params: any) {
      const first = params.messages[0].content as string;
      const invoice = /invoice (\S+)/.exec(first)?.[1] ?? "";
      const disputeId = /dispute (\S+)/.exec(first)?.[1] ?? "";
      const txn = /transaction ([^)]+)\)/.exec(first)?.[1] ?? "";
      const turn = params.messages.filter((m: any) => m.role === "assistant").length;
      await new Promise((r) => setTimeout(r, 700));
      const use = (name: string, input: unknown, i = 0) => ({ type: "tool_use", id: `tu_${turn}_${i}`, name, input });
      if (turn === 0) return { stop_reason: "tool_use", content: [use("get_dispute", { dispute_id: disputeId }), use("get_store_records", { invoice_id: invoice }, 1)] };
      if (turn === 1) {
        const store = JSON.parse(params.messages.at(-1).content[1].content);
        return {
          stop_reason: "tool_use",
          content: [
            ...(store.paypal_order_id ? [use("get_order", { id: store.paypal_order_id })] : []),
            use("get_shipment_tracking", { transaction_id: txn }, 1),
            use("list_transactions", { transaction_id: txn }, 2),
          ],
        };
      }
      const s = scenarioByKey(invoice)!;
      const f = s.store.fulfillment;
      const decision = !f.tracking_number ? "REFUND" : s.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" ? "OFFER" : "FIGHT";
      return {
        stop_reason: "tool_use",
        content: [
          use("submit_recommendation", {
            decision,
            win_probability: decision === "FIGHT" ? 0.82 : decision === "OFFER" ? 0.4 : 0.1,
            headline: `[scripted] ${decision} this ${s.reason.toLowerCase().replaceAll("_", " ")} dispute.`,
            rationale: "Scripted development response. Set GEMINI_API_KEY for a real analysis.",
            evidence: f.tracking_number ? [{ type: "PROOF_OF_FULFILLMENT", summary: `${f.carrier} ${f.tracking_number}: ${f.carrier_events.at(-1)?.status}`, source: "get_store_records" }] : [],
            response_to_paypal: `Order ${invoice} for ${s.item.name}. ${f.carrier_events.map((e) => `${e.at.slice(0, 10)}: ${e.status}`).join(". ") || "Shipped without tracking."}`,
            tracking_carrier: f.carrier ?? "",
            tracking_number: f.tracking_number ?? "",
            offer_amount: decision === "OFFER" ? 24 : 0,
            offer_type: decision === "OFFER" ? "REFUND" : "NONE",
            risks: [],
          }),
        ],
      };
    },
  };
}
