import type { CaseRecord, Decision, DisputeReason } from "@/lib/types";

export const REASON_LABEL: Record<DisputeReason, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described",
  UNAUTHORISED: "Unauthorized",
  CREDIT_NOT_PROCESSED: "Credit not processed",
  DUPLICATE_TRANSACTION: "Duplicate",
  INCORRECT_AMOUNT: "Incorrect amount",
  PAYMENT_BY_OTHER_MEANS: "Paid other way",
  CANCELED_RECURRING_BILLING: "Canceled billing",
  PROBLEM_WITH_REMITTANCE: "Remittance",
  OTHER: "Other",
};

export const DECISION_LABEL: Record<Decision, string> = { FIGHT: "Fight", OFFER: "Partial refund", REFUND: "Refund" };
export const DECISION_COLOR: Record<Decision, string> = { FIGHT: "var(--fight)", OFFER: "var(--offer)", REFUND: "var(--refund)" };

export const money = (v: number | string, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(v));

export function daysLeft(iso?: string) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function statusLabel(c: CaseRecord): string {
  switch (c.status) {
    case "NEW": return "Not analyzed";
    case "ANALYZING": return "Analyzing";
    case "READY": return "Ready to review";
    case "SUBMITTED": return c.submitted?.decision === "OFFER" ? "Offer sent" : "Evidence sent";
    case "WON": return "Won";
    case "LOST": return "Lost";
    case "SETTLED": return "Settled";
    case "REFUNDED": return "Refunded";
    case "ERROR": return "Needs attention";
  }
}
