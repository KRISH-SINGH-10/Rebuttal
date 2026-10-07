// The dispute analyst: Claude investigates a dispute with read-only PayPal tools and
// the shop's own records, then returns a recommendation the seller approves or edits.

import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlock, BetaMessageParam, BetaToolResultBlockParam, BetaToolUnion } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { paypal } from "./paypal";
import { getStoreRecords, STORE_RECORDS_TOOL } from "./store-records";
import type { Dispute, Recommendation, TraceStep } from "./types";

export const MODEL = "claude-opus-5-5";
const MAX_TURNS = 14;

const SYSTEM = `You review PayPal disputes for Juniper & Kiln, a two-person online shop, and recommend how the seller should respond. The seller reads your recommendation and approves or edits it before anything is sent to PayPal.

Investigate before you decide. Read the dispute, the PayPal order, the PayPal shipment tracker, the buyer's PayPal transaction history with the shop, and the shop's own records (listing text, customer messages, carrier scans). Compare the carrier's delivery address with the shipping address on the PayPal order. Then call submit_recommendation exactly once.

Choose one decision:
- FIGHT: send evidence to PayPal. Choose it when the evidence directly answers the buyer's claim. For item-not-received, PayPal generally needs online tracking showing delivery to the order's shipping address, and a signature for high-value orders. For not-as-described, the listing text and photos matter. For unauthorised, a confirmed delivery to the account holder's address and prior purchase history matter.
- OFFER: a partial refund, when the seller is partly at fault or a quick settlement is worth more than the likely outcome. Set offer_amount to a specific figure and explain how you got it.
- REFUND: accept the claim, when the seller cannot realistically win or the amount is too small to be worth fighting. Say so plainly; a good refund recommendation saves the seller time.

Rules:
- Every fact in evidence and response_to_paypal must come from a tool result. Name the tool in each evidence item's source. Never invent documents, photos or tracking numbers.
- response_to_paypal is read by a PayPal dispute specialist (or the card issuer, for a chargeback). Write it in the seller's voice, factual and chronological, under 1500 characters. For OFFER or REFUND, it is the short note sent with the offer or refund.
- win_probability is your honest estimate between 0 and 1 that PayPal rules for the seller if they fight. Give it for every decision.
- Leave tracking_carrier and tracking_number empty unless a carrier and tracking number appear in the tool results. Set offer_amount to 0 and offer_type to NONE unless the decision is OFFER.`;

const SUBMIT_TOOL = {
  name: "submit_recommendation",
  description: "Submit the final recommendation to the seller. Call once, after investigating.",
  strict: true,
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: [
      "decision", "win_probability", "headline", "rationale", "evidence", "response_to_paypal",
      "tracking_carrier", "tracking_number", "offer_amount", "offer_type", "risks",
    ],
    properties: {
      decision: { type: "string", enum: ["FIGHT", "OFFER", "REFUND"] },
      win_probability: { type: "number", description: "0 to 1" },
      headline: { type: "string", description: "One sentence the seller reads first." },
      rationale: { type: "string", description: "Why this decision, in 2-4 sentences." },
      evidence: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "summary", "source"],
          properties: {
            type: { type: "string", enum: ["PROOF_OF_FULFILLMENT", "PROOF_OF_DELIVERY_SIGNATURE", "ITEM_DESCRIPTION", "RETURN_POLICY", "PROOF_OF_RECEIPT_COPY", "OTHER"] },
            summary: { type: "string" },
            source: { type: "string", description: "Tool that returned this fact." },
          },
        },
      },
      response_to_paypal: { type: "string" },
      tracking_carrier: { type: "string" },
      tracking_number: { type: "string" },
      offer_amount: { type: "number" },
      offer_type: { type: "string", enum: ["REFUND", "REFUND_WITH_RETURN", "NONE"] },
      risks: { type: "array", items: { type: "string" }, description: "What could still go wrong." },
    },
  },
};

const RecommendationSchema = z.object({
  decision: z.enum(["FIGHT", "OFFER", "REFUND"]),
  win_probability: z.number().min(0).max(1),
  headline: z.string().min(1),
  rationale: z.string().min(1),
  evidence: z.array(z.object({
    type: z.enum(["PROOF_OF_FULFILLMENT", "PROOF_OF_DELIVERY_SIGNATURE", "ITEM_DESCRIPTION", "RETURN_POLICY", "PROOF_OF_RECEIPT_COPY", "OTHER"]),
    summary: z.string(),
    source: z.string(),
  })),
  response_to_paypal: z.string().min(1).max(2000),
  tracking_carrier: z.string(),
  tracking_number: z.string(),
  offer_amount: z.number().min(0),
  offer_type: z.enum(["REFUND", "REFUND_WITH_RETURN", "NONE"]),
  risks: z.array(z.string()),
});

type MessagesClient = Pick<Anthropic["beta"]["messages"], "create">;

export type AnalyzeOptions = {
  client?: MessagesClient;
  onStep?: (step: TraceStep) => void;
};

export async function analyzeDispute(dispute: Dispute, opts: AnalyzeOptions = {}): Promise<{ recommendation: Recommendation; trace: TraceStep[] }> {
  // APP_ANTHROPIC_API_KEY keeps the app's key separate from any ANTHROPIC_API_KEY that
  // developer tooling in the same environment might pick up.
  const client = opts.client ?? new Anthropic({ apiKey: process.env.APP_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY }).beta.messages;
  const gw = paypal();
  const trace: TraceStep[] = [];
  const step = (s: Omit<TraceStep, "at">) => {
    const full = { ...s, at: new Date().toISOString() };
    trace.push(full);
    opts.onStep?.(full);
  };

  const tools: BetaToolUnion[] = [...gw.agentTools(), STORE_RECORDS_TOOL, SUBMIT_TOOL];
  const txn = dispute.disputed_transactions[0];
  const messages: BetaMessageParam[] = [
    {
      role: "user",
      content: `New dispute ${dispute.dispute_id} on invoice ${txn?.invoice_number ?? "unknown"} (PayPal transaction ${txn?.seller_transaction_id ?? "unknown"}). Investigate and submit your recommendation.`,
    },
  ];

  let nudged = false;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      tools,
      messages,
    });

    if (res.stop_reason === "refusal") throw new Error("The model declined to analyze this dispute.");
    if (res.stop_reason === "max_tokens") throw new Error("The analysis ran out of output space.");

    messages.push({ role: "assistant", content: res.content as BetaContentBlock[] });
    const uses = res.content.filter((b): b is Extract<BetaContentBlock, { type: "tool_use" }> => b.type === "tool_use");

    if (uses.length === 0) {
      if (nudged) throw new Error("The model finished without a recommendation.");
      nudged = true;
      messages.push({ role: "user", content: "Call submit_recommendation now with your decision." });
      continue;
    }

    const results: BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      const input = (use.input ?? {}) as Record<string, unknown>;
      if (use.name === SUBMIT_TOOL.name) {
        const parsed = RecommendationSchema.safeParse(input);
        if (parsed.success) {
          step({ kind: "note", summary: `Recommendation: ${parsed.data.decision}` });
          return { recommendation: parsed.data, trace };
        }
        results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: `Invalid recommendation: ${parsed.error.message}` });
        continue;
      }
      try {
        const out = use.name === STORE_RECORDS_TOOL.name ? await getStoreRecords(String(input.invoice_id)) : await gw.runTool(use.name, input);
        step({ kind: "tool", tool: use.name, input, summary: summarize(use.name, out) });
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(out) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        step({ kind: "error", tool: use.name, input, summary: msg });
        results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: msg });
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("The analysis did not finish within its step limit.");
}

// One-line, human-readable description of what a tool returned, for the live trace.
export function summarize(tool: string, out: unknown): string {
  const o = (out ?? {}) as Record<string, any>;
  if (o.error) return String(o.error);
  switch (tool) {
    case "get_dispute":
      return `Dispute ${o.dispute_id}: ${String(o.reason ?? "").replaceAll("_", " ").toLowerCase()}, $${o.dispute_amount?.value}, ${String(o.dispute_life_cycle_stage ?? "").toLowerCase()}`;
    case "get_order": {
      const pu = o.purchase_units?.[0];
      const a = pu?.shipping?.address;
      return `Order ${o.id}: ${pu?.items?.map((i: any) => i.name).join(", ") ?? "items"}, ships to ${a?.admin_area_2 ?? "?"}, ${a?.admin_area_1 ?? ""}`;
    }
    case "get_shipment_tracking": {
      const t = o.trackers?.[0];
      return t ? `PayPal tracker: ${t.carrier} ${t.tracking_number}, status ${t.status}` : "No tracking on file with PayPal";
    }
    case "list_transactions": {
      const n = o.transaction_details?.length ?? 0;
      return `${n} transaction${n === 1 ? "" : "s"} from this buyer`;
    }
    case "get_store_records": {
      const f = o.fulfillment;
      const last = f?.carrier_events?.at(-1)?.status;
      return `Shop records: ${o.customer_messages?.length ?? 0} customer messages; ${last ? `last scan "${last}"` : "no carrier scans"}`;
    }
    default:
      return "Done";
  }
}
