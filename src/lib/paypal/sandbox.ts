// Live PayPal sandbox gateway. Everything the PayPal Agent Toolkit covers goes through
// it: the agent's read tools, listing and reading disputes, accepting a claim and
// adding shipment tracking. The Disputes REST API is called directly only for what the
// toolkit (v1.11) lacks: provide-evidence, make-offer, the sandbox adjudicate
// simulation and webhook signature checks.

import fs from "node:fs";
import path from "node:path";
import type { Dispute } from "../types";
import type { EvidenceSubmission, PayPalGateway } from "./gateway";
import { makeToolkit, toolkitDefs } from "./toolkit";

const ORDER_MAP = path.join(process.cwd(), "data", "sandbox-orders.json");

export function sandboxGateway(clientId: string, clientSecret: string): PayPalGateway {
  const tk = makeToolkit(clientId, clientSecret);
  const defs = toolkitDefs(tk);

  async function call(method: string, urlPath: string, body?: unknown | FormData) {
    const headers = await tk.client.getHeaders();
    const isForm = body instanceof FormData;
    if (isForm) delete headers["Content-Type"];
    const res = await fetch(`${tk.client.getBaseUrl()}${urlPath}`, {
      method,
      headers: isForm ? headers : { ...headers, "Content-Type": "application/json" },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`PayPal ${method} ${urlPath} failed (${res.status}): ${text.slice(0, 500)}`);
    return text ? JSON.parse(text) : {};
  }

  // Runs one Agent Toolkit tool. The toolkit reports PayPal errors as an `error` object
  // in its result rather than throwing, so turn those back into exceptions.
  async function toolkit(name: string, input: Record<string, unknown>): Promise<any> {
    const msg = await tk.handleToolCall({ id: `call_${Date.now()}`, type: "function", function: { name, arguments: JSON.stringify(input) } });
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    let out: any = content;
    try {
      out = JSON.parse(content);
    } catch {
      // plain text
    }
    if (out && typeof out === "object" && "error" in out && out.error) {
      const err = out.error as { message?: string };
      throw new Error(`PayPal ${name} failed: ${err.message ?? JSON.stringify(err).slice(0, 500)}`);
    }
    return out;
  }

  return {
    mode: "sandbox",

    agentTools: () => defs,

    runTool: (name, input) => toolkit(name, input),

    async orderIdForInvoice(invoiceId) {
      try {
        const map = JSON.parse(fs.readFileSync(ORDER_MAP, "utf8")) as Record<string, string>;
        return map[invoiceId] ?? null;
      } catch {
        return null;
      }
    },

    async listDisputes() {
      const list = await toolkit("list_disputes", { page_size: 50 });
      const items: Array<{ dispute_id: string }> = list.items ?? [];
      return Promise.all(items.map((d) => toolkit("get_dispute", { dispute_id: d.dispute_id }) as Promise<Dispute>));
    },

    getDispute: (id) => toolkit("get_dispute", { dispute_id: id }),

    async provideEvidence(id, ev: EvidenceSubmission) {
      const evidences = ev.evidence_types.map((t) => ({
        evidence_type: t,
        notes: ev.notes,
        ...(t === "PROOF_OF_FULFILLMENT" && ev.tracking
          ? { evidence_info: { tracking_info: [{ carrier_name: ev.tracking.carrier, tracking_number: ev.tracking.tracking_number }] } }
          : {}),
      }));
      const form = new FormData();
      form.append("input", new Blob([JSON.stringify({ evidences })], { type: "application/json" }));
      await call("POST", `/v1/customer/disputes/${id}/provide-evidence`, form);
    },

    async makeOffer(id, offer) {
      await call("POST", `/v1/customer/disputes/${id}/make-offer`, {
        note: offer.note,
        offer_amount: { currency_code: offer.currency, value: offer.amount },
        offer_type: offer.type,
      });
    },

    async acceptClaim(id, note) {
      try {
        await toolkit("accept_dispute_claim", { dispute_id: id, note });
      } catch (e) {
        // The toolkit's tool also sends its arguments as query parameters; if PayPal
        // rejects that, make the same call directly.
        console.warn("accept_dispute_claim via Agent Toolkit failed, retrying over REST:", e instanceof Error ? e.message : e);
        await call("POST", `/v1/customer/disputes/${id}/accept-claim`, { note, accept_claim_type: "REFUND" });
      }
    },

    async addTracking(transactionId, t, orderId) {
      const existing = await toolkit("get_shipment_tracking", { transaction_id: transactionId }).catch(() => null);
      const trackers: Array<{ tracking_number?: string }> = existing?.trackers ?? [];
      if (trackers.some((x) => x.tracking_number === t.tracking_number)) return "exists";
      try {
        await toolkit("create_shipment_tracking", { transaction_id: transactionId, tracking_number: t.tracking_number, carrier: t.carrier, status: "SHIPPED" });
      } catch (e) {
        // The toolkit uses the older trackers API, which apps without the "Add tracking"
        // feature get a 403 from. Orders v2 /track works for any app that took the payment.
        if (!orderId) throw e;
        await call("POST", `/v2/checkout/orders/${orderId}/track`, { capture_id: transactionId, tracking_number: t.tracking_number, carrier: t.carrier, notify_payer: false });
      }
      return "added";
    },

    async verifyWebhook(headers, event) {
      const webhookId = process.env.PAYPAL_WEBHOOK_ID;
      if (!webhookId) throw new Error("Set PAYPAL_WEBHOOK_ID to receive PayPal webhooks.");
      const h = (k: string) => headers.get(k) ?? "";
      const res = await call("POST", "/v1/notifications/verify-webhook-signature", {
        auth_algo: h("paypal-auth-algo"),
        cert_url: h("paypal-cert-url"),
        transmission_id: h("paypal-transmission-id"),
        transmission_sig: h("paypal-transmission-sig"),
        transmission_time: h("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: event,
      });
      return res.verification_status === "SUCCESS";
    },

    async simulateRuling(id, outcome) {
      await call("POST", `/v1/customer/disputes/${id}/adjudicate`, { adjudication_outcome: outcome });
    },

    async fileTestDispute() {
      // Disputes are filed by the buyer, which needs the sandbox buyer account.
      // `npm run seed:sandbox` walks through it; see README.
      throw new Error("In sandbox mode, file test disputes from the sandbox buyer account (see README, 'Seeding the sandbox').");
    },
  };
}
