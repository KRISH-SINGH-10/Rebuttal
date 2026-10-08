// Case state for the dispute inbox. Kept in memory and mirrored to data/cases.json
// so a restart of the dev server keeps the demo history.

import fs from "node:fs";
import path from "node:path";
import { outcomeFor } from "./actions";
import { paypal } from "./paypal";
import type { CaseRecord, CaseStatus, Dispute } from "./types";

const FILE = path.join(process.cwd(), "data", "cases.json");
// One case map per PayPal mode, so switching between simulator and sandbox keeps both.
const g = globalThis as unknown as { __rebuttalCases?: Partial<Record<"mock" | "sandbox", Map<string, CaseRecord>>> };

function load(): Map<string, CaseRecord> {
  const mode = paypal().mode;
  g.__rebuttalCases ??= {};
  const existing = g.__rebuttalCases[mode];
  if (existing) return existing;
  let map = new Map<string, CaseRecord>();
  // Mock disputes live in memory only, so a persisted mock case file would point at
  // disputes that no longer exist after a restart.
  if (paypal().mode === "sandbox") {
    try {
      map = new Map((JSON.parse(fs.readFileSync(FILE, "utf8")) as CaseRecord[]).map((c) => [c.id, c]));
    } catch {
      // first run
    }
  }
  g.__rebuttalCases[mode] = map;
  return map;
}

function persist() {
  if (paypal().mode !== "sandbox") return;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify([...load().values()], null, 2));
}

export function upsertFromDispute(d: Dispute): CaseRecord {
  const map = load();
  const existing = map.get(d.dispute_id);
  const rec: CaseRecord = existing
    ? { ...existing, dispute: d, updated_at: new Date().toISOString() }
    : { id: d.dispute_id, dispute: d, status: "NEW", trace: [], updated_at: new Date().toISOString() };
  // PayPal may close a dispute outside the app (a ruling, or a dispute decided before this
  // server started); show that result instead of offering to investigate a closed case.
  if (!rec.outcome && d.dispute_outcome?.outcome_code) {
    const o = outcomeFor(d, rec.submitted?.decision);
    if (o) Object.assign(rec, { outcome: o, status: o.result });
  }
  map.set(rec.id, rec);
  persist();
  return rec;
}

export async function syncCases(): Promise<CaseRecord[]> {
  const disputes = await paypal().listDisputes();
  disputes.forEach(upsertFromDispute);
  return listCases();
}

export function listCases(): CaseRecord[] {
  return [...load().values()].sort((a, b) => b.dispute.create_time.localeCompare(a.dispute.create_time));
}

export function getCase(id: string): CaseRecord | undefined {
  return load().get(id);
}

export function updateCase(id: string, patch: Partial<CaseRecord> & { status?: CaseStatus }): CaseRecord {
  const map = load();
  const cur = map.get(id);
  if (!cur) throw new Error(`Unknown case ${id}`);
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  map.set(id, next);
  persist();
  return next;
}

export function resetCases() {
  g.__rebuttalCases = { ...g.__rebuttalCases, [paypal().mode]: new Map() };
  persist();
}

export function stats(cases: CaseRecord[]) {
  const amt = (c: CaseRecord) => Number(c.dispute.dispute_amount.value);
  const open = cases.filter((c) => !c.outcome);
  const decided = cases.filter((c) => c.outcome);
  return {
    open: open.length,
    at_risk: open.reduce((s, c) => s + amt(c), 0),
    kept: decided.reduce((s, c) => s + (c.outcome?.amount_kept ?? 0), 0),
    won: decided.filter((c) => c.outcome?.result === "WON").length,
    decided: decided.length,
  };
}
