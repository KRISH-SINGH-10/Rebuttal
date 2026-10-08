"use client";

import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import type { Recommendation } from "@/lib/types";
import { gridTheme } from "./grid";

type Evidence = Recommendation["evidence"][number];

function FactCell({ data }: ICellRendererParams<Evidence>) {
  return <div className="py-2 leading-snug whitespace-normal">{data?.summary}</div>;
}

// The agent's evidence trail: each fact it relies on, what kind of PayPal evidence it is,
// and which tool returned it, so the seller can check every claim before approving.
export default function EvidenceGrid({ evidence, toolLabel }: { evidence: Evidence[]; toolLabel: Record<string, string> }) {
  const cols = useMemo<ColDef<Evidence>[]>(
    () => [
      { headerName: "Fact", field: "summary", cellRenderer: FactCell, flex: 3, minWidth: 260, autoHeight: true, wrapText: true },
      {
        headerName: "Evidence type",
        field: "type",
        flex: 1.2,
        minWidth: 150,
        valueFormatter: (p) => String(p.value ?? "").replaceAll("_", " ").toLowerCase(),
        cellClass: "text-muted",
        wrapText: true,
        autoHeight: true,
        filter: "agTextColumnFilter",
      },
      {
        headerName: "Source",
        field: "source",
        flex: 1.2,
        minWidth: 150,
        valueFormatter: (p) => toolLabel[p.value] ?? p.value,
        cellClass: "text-muted",
        filter: "agTextColumnFilter",
      },
    ],
    [toolLabel],
  );
  return (
    <div>
      <AgGridReact<Evidence>
        theme={gridTheme}
        rowData={evidence}
        columnDefs={cols}
        domLayout="autoHeight"
        defaultColDef={{ sortable: true }}
        suppressCellFocus
      />
    </div>
  );
}
