"use client";

import type { ChartProps, ChartDefinition, ChartBaseConfig } from "../registry";
import { inferKind } from "../utils/infer";
import { fmt } from "../utils/fmt";

export interface KPIConfig extends ChartBaseConfig {
  value?: string;  // primary metric column
  delta?: string;  // optional comparison column (prior period, target, etc.)
  label?: string;  // display label override — defaults to column name
}

export function KPITile({ data, config, theme }: ChartProps<KPIConfig>) {
  const { value = "", delta, label } = config;

  if (!data.length || !value) return null;

  const total = data.reduce((acc, row) => acc + (Number(row[value]) || 0), 0);
  const deltaTotal = delta
    ? data.reduce((acc, row) => acc + (Number(row[delta]) || 0), 0)
    : null;

  const pct =
    deltaTotal != null && deltaTotal !== 0
      ? ((total - deltaTotal) / Math.abs(deltaTotal)) * 100
      : null;

  const positive = pct != null && pct >= 0;

  return (
    <div
      className="flex flex-col items-center justify-center h-full min-h-[120px] gap-1.5 select-none px-4"
      style={{ fontFamily: theme.fontFamily, color: theme.axis }}
    >
      <div
        className="text-4xl font-semibold tracking-tight"
        style={{ color: theme.ink }}
      >
        {fmt(total)}
      </div>

      <div className="text-xs uppercase tracking-widest opacity-50">
        {label ?? value}
      </div>

      {pct != null && (
        <div
          className="text-sm font-medium tabular-nums"
          style={{ color: positive ? "#16a34a" : "#dc2626" }}
        >
          {positive ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
        </div>
      )}

      {deltaTotal != null && (
        <div className="text-xs opacity-40 tabular-nums">
          vs {fmt(deltaTotal)}
        </div>
      )}
    </div>
  );
}

export const kpiDefinition: ChartDefinition<KPIConfig> = {
  type: "kpi",
  name: "KPI Tile",
  description: "Single aggregate metric with optional delta vs prior period or target.",

  suitability(columns, data) {
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    const strs = columns.filter((c) => inferKind(data.map((r) => r[c])) === "string");
    // Single-row aggregate result with numeric(s) and no categoricals
    if (data.length === 1 && nums.length >= 1 && strs.length === 0) return 0.92;
    // Multi-row but only numerics (e.g. SELECT SUM(a), SUM(b))
    if (data.length <= 3 && nums.length >= 1 && strs.length === 0) return 0.7;
    return 0;
  },

  deriveConfig(columns, data) {
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    return { value: nums[0], delta: nums[1] };
  },

  component: KPITile,
};
