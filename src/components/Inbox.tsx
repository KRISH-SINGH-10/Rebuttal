"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CaseRecord } from "@/lib/types";
import { daysLeft, DECISION_COLOR, DECISION_LABEL, money, REASON_LABEL, statusLabel } from "./format";

ModuleRegistry.registerModules([AllCommunityModule]);

type Stats = { open: number; at_risk: number; kept: number; won: number; decided: number };
type Payload = { mode: "mock" | "sandbox"; cases: CaseRecord[]; stats: Stats };

// Grid theme built from the app's CSS variables so it follows light and dark mode.
const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--panel)",
  foregroundColor: "var(--ink)",
  borderColor: "var(--line)",
  headerBackgroundColor: "var(--bg)",
  headerTextColor: "var(--muted)",
  accentColor: "var(--accent)",
  rowHoverColor: "var(--accent-soft)",
  fontFamily: "inherit",
  fontSize: 14,
  headerFontSize: 12,
  headerFontWeight: 600,
  rowHeight: 64,
  wrapperBorderRadius: 10,
  spacing: 7,
});

function BuyerCell({ data }: ICellRendererParams<CaseRecord>) {
  const t = data?.dispute.disputed_transactions[0];
  return (
    <div className="flex h-full flex-col justify-center leading-tight">
      <span className="font-medium">{t?.buyer?.name ?? "Unknown buyer"}</span>
      <span className="truncate text-xs text-muted">{t?.items?.[0]?.item_description ?? t?.invoice_number}</span>
    </div>
  );
}

function ReasonCell({ data }: ICellRendererParams<CaseRecord>) {
  if (!data) return null;
  const stage = data.dispute.dispute_life_cycle_stage;
  return (
    <div className="flex h-full flex-col justify-center leading-tight">
      <span>{REASON_LABEL[data.dispute.reason]}</span>
      <span className="text-xs text-muted">{stage === "CHARGEBACK" ? "Chargeback" : stage === "INQUIRY" ? "Inquiry" : stage.toLowerCase()}</span>
    </div>
  );
}

function DueCell({ data }: ICellRendererParams<CaseRecord>) {
  if (!data) return null;
  if (data.outcome || data.submitted) return <span className="text-muted">Responded</span>;
  const d = daysLeft(data.dispute.seller_response_due_date);
  if (d === null) return <span className="text-muted">-</span>;
  return <span className="tabular font-medium" style={{ color: d <= 3 ? "var(--danger)" : undefined }}>{d <= 0 ? "Overdue" : `${d} day${d === 1 ? "" : "s"}`}</span>;
}

function AgentCell({ data }: ICellRendererParams<CaseRecord>) {
  if (!data) return null;
  const r = data.recommendation;
  const decided = data.submitted?.decision ?? r?.decision;
  return (
    <div className="flex h-full items-center gap-3">
      {decided ? (
        <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ color: DECISION_COLOR[decided], border: `1px solid ${DECISION_COLOR[decided]}` }}>
          {DECISION_LABEL[decided]}
        </span>
      ) : null}
      <span className="text-sm text-muted">{statusLabel(data)}</span>
      {r && !data.outcome ? (
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted tabular" title="Estimated chance PayPal rules for the seller">
          <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(r.win_probability * 100)}%` }} />
          </span>
          {Math.round(r.win_probability * 100)}%
        </span>
      ) : null}
      {data.outcome ? (
        <span className="ml-auto text-xs font-semibold tabular" style={{ color: data.outcome.amount_kept > 0 ? "var(--fight)" : "var(--refund)" }}>
          {data.outcome.amount_kept > 0 ? `+${money(data.outcome.amount_kept)} kept` : `${money(data.outcome.amount_lost)} refunded`}
        </span>
      ) : null}
    </div>
  );
}

export default function Inbox() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/cases", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) setError(json.error);
    else {
      setError(null);
      setData(json);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function fileDispute() {
    setBusy(true);
    const res = await fetch("/api/demo/dispute", { method: "POST" });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    router.push(`/cases/${json.id}`);
  }

  async function reset() {
    await fetch("/api/demo/reset", { method: "POST" });
    load();
  }

  const cols = useMemo<ColDef<CaseRecord>[]>(
    () => [
      { headerName: "Buyer", cellRenderer: BuyerCell, flex: 1.6, minWidth: 220, valueGetter: (p) => p.data?.dispute.disputed_transactions[0]?.buyer?.name },
      { headerName: "Claim", cellRenderer: ReasonCell, flex: 1, minWidth: 150, valueGetter: (p) => p.data && REASON_LABEL[p.data.dispute.reason] },
      {
        headerName: "Amount",
        flex: 0.7,
        minWidth: 100,
        type: "rightAligned",
        valueGetter: (p) => Number(p.data?.dispute.dispute_amount.value),
        valueFormatter: (p) => money(p.value),
        cellClass: "tabular font-medium",
      },
      {
        headerName: "Respond within",
        cellRenderer: DueCell,
        flex: 0.8,
        minWidth: 130,
        valueGetter: (p) => (p.data?.submitted ? 999 : daysLeft(p.data?.dispute.seller_response_due_date)),
        sort: "asc",
      },
      { headerName: "Agent", cellRenderer: AgentCell, flex: 1.8, minWidth: 280, valueGetter: (p) => p.data && statusLabel(p.data) },
    ],
    [],
  );

  const s = data?.stats;
  const winRate = s && s.decided ? Math.round((s.won / s.decided) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Disputes</h1>
          <p className="text-sm text-muted">The agent investigates each dispute and recommends a response. Nothing is sent to PayPal until you approve it.</p>
        </div>
        <div className="flex items-center gap-2">
          {data?.mode === "mock" ? (
            <button onClick={reset} className="rounded-md px-3 py-2 text-sm text-muted hover:text-ink">Reset demo</button>
          ) : null}
          <button onClick={fileDispute} disabled={busy} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-panel disabled:opacity-60">
            {busy ? "Filing..." : "File a test dispute"}
          </button>
        </div>
      </div>

      {data?.mode === "mock" ? (
        <p className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">
          Demo mode: PayPal is simulated in memory. Set sandbox credentials to run against the PayPal sandbox.
        </p>
      ) : null}
      {error ? <p className="rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Open disputes" value={s ? String(s.open) : "-"} />
        <Kpi label="Money at risk" value={s ? money(s.at_risk) : "-"} />
        <Kpi label="Money kept" value={s ? money(s.kept) : "-"} accent />
        <Kpi label="Win rate" value={winRate === null ? "-" : `${winRate}%`} sub={s?.decided ? `${s.won} of ${s.decided} decided` : "No rulings yet"} />
      </div>

      <div className="h-[420px]">
        <AgGridReact<CaseRecord>
          theme={gridTheme}
          rowData={data?.cases ?? []}
          columnDefs={cols}
          getRowId={(p) => p.data.id}
          onRowClicked={(e) => e.data && router.push(`/cases/${e.data.id}`)}
          rowClass="cursor-pointer"
          overlayNoRowsTemplate="No disputes. File a test dispute to try the flow."
          suppressCellFocus
        />
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular" style={accent ? { color: "var(--accent)" } : undefined}>{value}</div>
      {sub ? <div className="text-xs text-muted">{sub}</div> : null}
    </div>
  );
}
