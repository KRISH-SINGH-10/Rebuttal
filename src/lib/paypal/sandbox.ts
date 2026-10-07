// Live PayPal sandbox gateway. Reads go through the PayPal Agent Toolkit; dispute
// actions call the Disputes REST API directly because the toolkit does not cover
// provide-evidence, make-offer or the sandbox simulation endpoints.

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

  return {
    mode: "sandbox",

    agentTools: () => defs,

    async runTool(name, input) {
      const msg = await tk.handleToolCall({
        id: `call_${Date.now()}`,
        type: "function",
        function: { name, arguments: JSON.stringify(input) },
      });
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    },

    async orderIdForInvoice(invoiceId) {
      try {
        const map = JSON.parse(fs.readFileSync(ORDER_MAP, "utf8")) as Record<string, string>;
        return map[invoiceId] ?? null;
      } catch {
        return null;
      }
    },

    async listDisputes() {
      const list = await call("GET", "/v1/customer/disputes?page_size=50");
      const items: Array<{ dispute_id: string }> = list.items ?? [];
      return Promise.all(items.map((d) => call("GET", `/v1/customer/disputes/${d.dispute_id}`) as Promise<Dispute>));
    },

    getDispute: (id) => call("GET", `/v1/customer/disputes/${id}`),

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
      await call("POST", `/v1/customer/disputes/${id}/accept-claim`, { note, accept_claim_type: "REFUND" });
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
