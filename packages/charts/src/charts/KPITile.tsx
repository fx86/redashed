"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartProps, ChartDefinition, ChartBaseConfig } from "../registry";
import { inferKind } from "../utils/infer";
import { fmt } from "../utils/fmt";

export interface KPIConfig extends ChartBaseConfig {
  value?: string;
  delta?: string;
  label?: string;
}

export function KPITile({ data, config, theme }: ChartProps<KPIConfig>) {
  const { value = "", delta, label } = config;
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(48);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Scale to ~28% of height, also bounded by width so it doesn't overflow
      const fromHeight = height * 0.28;
      const fromWidth = width * 0.22;
      setFontSize(Math.min(Math.max(Math.min(fromHeight, fromWidth), 24), 140));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      ref={containerRef}
      className="flex flex-col items-center justify-center h-full w-full select-none px-4 gap-[0.15em]"
      style={{ fontFamily: theme.fontFamily, color: theme.axis }}
    >
      <div
        className="font-semibold tracking-tight leading-none tabular-nums"
        style={{ color: theme.ink, fontSize }}
      >
        {fmt(total)}
      </div>

      <div
        className="uppercase tracking-widest opacity-50 whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
        style={{ fontSize: Math.max(fontSize * 0.22, 10) }}
      >
        {label ?? value}
      </div>

      {pct != null && (
        <div
          className="font-medium tabular-nums"
          style={{
            color: positive ? "#16a34a" : "#dc2626",
            fontSize: Math.max(fontSize * 0.28, 12),
          }}
        >
          {positive ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
        </div>
      )}

      {deltaTotal != null && (
        <div
          className="opacity-40 tabular-nums"
          style={{ fontSize: Math.max(fontSize * 0.22, 10) }}
        >
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
    if (data.length === 1 && nums.length >= 1 && strs.length === 0) return 0.92;
    if (data.length <= 3 && nums.length >= 1 && strs.length === 0) return 0.7;
    return 0;
  },

  deriveConfig(columns, data) {
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    return { value: nums[0], delta: nums[1] };
  },

  component: KPITile,
};
