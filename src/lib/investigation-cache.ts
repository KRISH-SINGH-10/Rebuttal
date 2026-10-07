// Saved investigations. The Gemini free tier allows only a handful of requests per
// minute, so a hosted demo would stall the moment several judges click Investigate.
// Each finished investigation is saved to disk and replayed for the same dispute
// facts; "Re-run" forces a fresh one. Entries committed under cache/investigations
// ship with the repo, so the demo disputes work even with no model quota left.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Dispute, Recommendation, TraceStep } from "./types";

export type CachedInvestigation = {
  key: string;
  dispute_id: string;
  model: string;
  saved_at: string;
  recommendation: Recommendation;
  trace: TraceStep[];
};

const dir = () => process.env.REBUTTAL_CACHE_DIR ?? path.join(process.cwd(), "cache", "investigations");

// The same dispute facts give the same key. Demo disputes are keyed by invoice number,
// which stays stable when the simulator re-creates them with new dispute IDs.
export function cacheKey(d: Dispute): string {
  const t = d.disputed_transactions[0];
  const facts = {
    who: t?.invoice_number || d.dispute_id,
    reason: d.reason,
    amount: d.dispute_amount,
    stage: d.dispute_life_cycle_stage,
    buyer_messages: (d.messages ?? []).filter((m) => m.posted_by === "BUYER").map((m) => m.content),
  };
  const slug = String(facts.who).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return `${slug}-${crypto.createHash("sha256").update(JSON.stringify(facts)).digest("hex").slice(0, 12)}`;
}

export function loadInvestigation(d: Dispute): CachedInvestigation | null {
  try {
    const hit = JSON.parse(fs.readFileSync(path.join(dir(), `${cacheKey(d)}.json`), "utf8")) as CachedInvestigation;
    if (hit.dispute_id === d.dispute_id) return hit;
    // Saved under an earlier dispute ID for the same order: point it at this one.
    return JSON.parse(JSON.stringify(hit).replaceAll(hit.dispute_id, d.dispute_id)) as CachedInvestigation;
  } catch {
    return null;
  }
}

export function saveInvestigation(d: Dispute, entry: Omit<CachedInvestigation, "key" | "dispute_id" | "saved_at">) {
  const full: CachedInvestigation = { key: cacheKey(d), dispute_id: d.dispute_id, saved_at: new Date().toISOString(), ...entry };
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(dir(), `${full.key}.json`), JSON.stringify(full, null, 2));
  } catch (e) {
    // A read-only disk only costs us the cache, not the analysis.
    console.warn("Could not save investigation:", e instanceof Error ? e.message : e);
  }
  return full;
}
