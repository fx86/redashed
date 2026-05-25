"use client";

import { useMemo, useState } from "react";
import type { ChartProps, ChartDefinition, ChartBaseConfig } from "../registry";
import { inferKind } from "../utils/infer";
import { fmt } from "../utils/fmt";

export interface PivotConfig extends ChartBaseConfig {
  rows?: string[];
  col?: string;
  value?: string;
  conditionalFormat?: "row" | "column" | "overall" | "none";
  showTotals?: boolean;
  showPct?: boolean;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function PivotTable({ data, config, theme }: ChartProps<PivotConfig>) {
  const {
    rows: rowCols = [],
    col = "",
    value = "",
    conditionalFormat = "overall",
    showTotals = true,
    showPct = false,
  } = config;

  const [cfMode, setCfMode] = useState<"row" | "column" | "overall" | "none">(conditionalFormat);
  const [totals, setTotals] = useState(showTotals);
  const [pct, setPct] = useState(showPct);

  // Build aggregation: rowKey (JSON-stable) → colKey → sum(value)
  const { rowKeys, rowTuples, colKeys, grid, rowTotals, colTotals, grandTotal } = useMemo(() => {
    if (!rowCols.length || !col || !value) {
      return {
        rowKeys: [] as string[],
        rowTuples: new Map<string, string[]>(),
        colKeys: [] as string[],
        grid: new Map<string, Map<string, number>>(),
        rowTotals: new Map<string, number>(),
        colTotals: new Map<string, number>(),
        grandTotal: 0,
      };
    }

    const grid = new Map<string, Map<string, number>>();
    const rowTuples = new Map<string, string[]>();
    const rowOrder: string[] = [];
    const colSet = new Set<string>();

    for (const row of data) {
      const tuple = rowCols.map((rc) => String(row[rc] ?? ""));
      const rk = JSON.stringify(tuple);
      const ck = String(row[col] ?? "");

      if (!rowTuples.has(rk)) {
        rowTuples.set(rk, tuple);
        rowOrder.push(rk);
      }
      colSet.add(ck);

      if (!grid.has(rk)) grid.set(rk, new Map());
      const rowMap = grid.get(rk)!;
      rowMap.set(ck, (rowMap.get(ck) ?? 0) + (Number(row[value]) || 0));
    }

    const rowKeys = rowOrder;
    const colKeys = [...colSet];

    const rowTotals = new Map<string, number>();
    const colTotals = new Map<string, number>();
    let grandTotal = 0;

    for (const rk of rowKeys) {
      const rt = colKeys.reduce((s, ck) => s + (grid.get(rk)?.get(ck) ?? 0), 0);
      rowTotals.set(rk, rt);
      grandTotal += rt;
    }
    for (const ck of colKeys) {
      const ct = rowKeys.reduce((s, rk) => s + (grid.get(rk)?.get(ck) ?? 0), 0);
      colTotals.set(ck, ct);
    }

    return { rowKeys, rowTuples, colKeys, grid, rowTotals, colTotals, grandTotal };
  }, [data, rowCols, col, value]);

  // Pre-compute per-row and per-column maxes for conditional formatting
  const rowMaxes = useMemo(
    () => new Map(rowKeys.map((rk) => [rk, Math.max(0, ...colKeys.map((ck) => grid.get(rk)?.get(ck) ?? 0))])),
    [rowKeys, colKeys, grid],
  );
  const colMaxes = useMemo(
    () => new Map(colKeys.map((ck) => [ck, Math.max(0, ...rowKeys.map((rk) => grid.get(rk)?.get(ck) ?? 0))])),
    [rowKeys, colKeys, grid],
  );
  const overallMax = useMemo(
    () => Math.max(0, ...[...rowMaxes.values()]),
    [rowMaxes],
  );

  function cellBg(rk: string, ck: string): string {
    if (cfMode === "none") return "transparent";
    const v = grid.get(rk)?.get(ck) ?? 0;
    let max = 0;
    if (cfMode === "overall") max = overallMax;
    else if (cfMode === "row") max = rowMaxes.get(rk) ?? 0;
    else if (cfMode === "column") max = colMaxes.get(ck) ?? 0;
    if (max === 0) return "transparent";
    return hexToRgba(theme.accent, (v / max) * 0.65);
  }

  function cellDisplay(rk: string, ck: string): string {
    const v = grid.get(rk)?.get(ck) ?? 0;
    if (!pct) return v === 0 ? "—" : fmt(v);
    const denom =
      cfMode === "row" ? (rowTotals.get(rk) ?? 0)
      : cfMode === "column" ? (colTotals.get(ck) ?? 0)
      : grandTotal;
    if (denom === 0) return "—";
    return `${((v / denom) * 100).toFixed(1)}%`;
  }

  const base = { fontFamily: theme.fontFamily, fontSize: theme.fontSize };
  const headerStyle = { ...base, color: theme.axis, borderColor: theme.grid };
  const cellStyle = { ...base, color: theme.ink, borderColor: theme.grid };

  if (!rowCols.length || !col || !value) {
    return (
      <div className="flex items-center justify-center h-full text-sm opacity-40" style={base}>
        Configure rows, column, and value to display pivot
      </div>
    );
  }

  return (
    <div className="w-full overflow-auto">
      {/* Inline controls */}
      <div
        className="flex flex-wrap items-center gap-4 mb-2 text-xs"
        style={{ ...base, color: theme.axis }}
      >
        <label className="flex items-center gap-1.5">
          <span className="opacity-50">Format</span>
          <select
            value={cfMode}
            onChange={(e) => setCfMode(e.target.value as typeof cfMode)}
            className="bg-transparent border-0 border-b py-0 text-xs cursor-pointer"
            style={{ borderColor: theme.grid, color: theme.axis }}
          >
            <option value="overall">Overall</option>
            <option value="row">Per row</option>
            <option value="column">Per column</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={totals}
            onChange={(e) => setTotals(e.target.checked)}
            className="cursor-pointer"
          />
          Totals
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={pct}
            onChange={(e) => setPct(e.target.checked)}
            className="cursor-pointer"
          />
          % values
        </label>
      </div>

      <table className="w-full border-collapse" style={base}>
        <thead>
          <tr>
            {rowCols.map((rc) => (
              <th
                key={rc}
                className="text-left px-2 py-1.5 font-medium whitespace-nowrap border-b"
                style={{ ...headerStyle, opacity: 0.55 }}
              >
                {rc}
              </th>
            ))}
            {colKeys.map((ck) => (
              <th
                key={ck}
                className="text-right px-2 py-1.5 font-medium whitespace-nowrap border-b"
                style={headerStyle}
              >
                {ck}
              </th>
            ))}
            {totals && (
              <th
                className="text-right px-2 py-1.5 font-medium whitespace-nowrap border-b italic"
                style={{ ...headerStyle, opacity: 0.5 }}
              >
                Total
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((rk) => {
            const tuple = rowTuples.get(rk)!;
            return (
              <tr key={rk}>
                {tuple.map((part, pi) => (
                  <td key={pi} className="px-2 py-1.5 whitespace-nowrap border-b" style={headerStyle}>
                    {part}
                  </td>
                ))}
                {colKeys.map((ck) => (
                  <td
                    key={ck}
                    className="text-right px-2 py-1.5 font-mono whitespace-nowrap border-b transition-colors"
                    style={{ ...cellStyle, backgroundColor: cellBg(rk, ck) }}
                  >
                    {cellDisplay(rk, ck)}
                  </td>
                ))}
                {totals && (
                  <td
                    className="text-right px-2 py-1.5 font-mono whitespace-nowrap border-b italic"
                    style={{ ...cellStyle, opacity: 0.6 }}
                  >
                    {pct ? "100%" : fmt(rowTotals.get(rk) ?? 0)}
                  </td>
                )}
              </tr>
            );
          })}
          {totals && (
            <tr>
              {rowCols.map((_, i) => (
                <td
                  key={i}
                  className="px-2 py-1.5 italic border-t"
                  style={{ ...headerStyle, opacity: 0.5 }}
                >
                  {i === 0 ? "Total" : ""}
                </td>
              ))}
              {colKeys.map((ck) => (
                <td
                  key={ck}
                  className="text-right px-2 py-1.5 font-mono font-medium whitespace-nowrap border-t"
                  style={cellStyle}
                >
                  {pct
                    ? `${(((colTotals.get(ck) ?? 0) / grandTotal) * 100).toFixed(1)}%`
                    : fmt(colTotals.get(ck) ?? 0)}
                </td>
              ))}
              <td
                className="text-right px-2 py-1.5 font-mono font-semibold whitespace-nowrap border-t"
                style={cellStyle}
              >
                {pct ? "100%" : fmt(grandTotal)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const pivotDefinition: ChartDefinition<PivotConfig> = {
  type: "pivot",
  name: "Pivot Table",
  description: "Cross-tabulation with conditional formatting at row, column, or overall level. Supports margin totals and normalised % values.",

  suitability(columns, data) {
    const strs = columns.filter((c) => inferKind(data.map((r) => r[c])) === "string");
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    // Requires at least 2 categoricals + 1 numeric; score intentionally low so
    // bar/line win auto-selection — pivot is typically user-selected
    if (strs.length >= 2 && nums.length >= 1) return 0.5;
    return 0;
  },

  deriveConfig(columns, data) {
    const strs = columns.filter((c) => inferKind(data.map((r) => r[c])) === "string");
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    // Lower cardinality categorical → column axis; rest → row dimensions
    const card = (c: string) => new Set(data.map((r) => r[c])).size;
    const sorted = [...strs].sort((a, b) => card(a) - card(b));
    return {
      col: sorted[0],
      rows: sorted.slice(1),
      value: nums[0],
      conditionalFormat: "overall",
      showTotals: true,
      showPct: false,
    };
  },

  component: PivotTable,
};
