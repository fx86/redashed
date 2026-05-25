"use client";

import { useMemo } from "react";
import type { ChartProps, ChartDefinition } from "../registry";
import { inferKind } from "../utils/infer";
import { fmt } from "../utils/fmt";

const PALETTE = [
  "#6366f1", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6",
];

const SVG_SIZE = 220;
const CX = SVG_SIZE / 2;
const CY = SVG_SIZE / 2;
const OUTER_R = 90;
const INNER_R = 50;

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function slicePath(cx: number, cy: number, inner: number, outer: number, a1: number, a2: number): string {
  const s1 = polar(cx, cy, outer, a1);
  const e1 = polar(cx, cy, outer, a2);
  const s2 = polar(cx, cy, inner, a2);
  const e2 = polar(cx, cy, inner, a1);
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return [
    `M ${s1.x} ${s1.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${e1.x} ${e1.y}`,
    `L ${s2.x} ${s2.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${e2.x} ${e2.y}`,
    "Z",
  ].join(" ");
}

export function DonutChart({ data, config, theme }: ChartProps) {
  const { x = "", y = "" } = config; // x = category col, y = value col

  const slices = useMemo(() => {
    if (!data.length || !x || !y) return [];

    // Aggregate: sum values per category
    const agg = new Map<string, number>();
    for (const row of data) {
      const cat = String(row[x] ?? "");
      agg.set(cat, (agg.get(cat) ?? 0) + (Number(row[y]) || 0));
    }

    const total = [...agg.values()].reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    const START = -Math.PI / 2;
    let angle = START;
    return [...agg.entries()].map(([cat, val], i) => {
      const sweep = (val / total) * 2 * Math.PI;
      const a1 = angle;
      angle += sweep;
      const a2 = angle;
      return {
        cat,
        val,
        pct: (val / total) * 100,
        path: slicePath(CX, CY, INNER_R, OUTER_R, a1, a2),
        color: PALETTE[i % PALETTE.length],
      };
    });
  }, [data, x, y]);

  if (!slices.length) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm opacity-40"
        style={{ fontFamily: theme.fontFamily }}
      >
        No data
      </div>
    );
  }

  return (
    <div
      className="flex flex-col sm:flex-row items-center gap-4 w-full"
      style={{ fontFamily: theme.fontFamily, fontSize: theme.fontSize }}
    >
      <svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        className="shrink-0"
      >
        {slices.map((s) => (
          <path key={s.cat} d={s.path} fill={s.color} stroke="none" />
        ))}
        {/* Centre label */}
        <text
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          fontSize={11}
          fill={theme.axis}
        >
          {slices.length} categories
        </text>
        <text
          x={CX}
          y={CY + 10}
          textAnchor="middle"
          fontSize={13}
          fontWeight="600"
          fill={theme.ink}
        >
          {fmt(slices.reduce((a, s) => a + s.val, 0))}
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-col gap-1.5 min-w-0 w-full sm:w-auto">
        {slices.map((s) => (
          <div key={s.cat} className="flex items-center gap-2 text-xs truncate">
            <span
              className="shrink-0 rounded-sm"
              style={{ width: 10, height: 10, background: s.color }}
            />
            <span className="truncate opacity-80" style={{ color: theme.axis }}>
              {s.cat}
            </span>
            <span className="ml-auto pl-4 font-mono shrink-0" style={{ color: theme.ink }}>
              {s.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const donutDefinition: ChartDefinition = {
  type: "donut",
  name: "Donut Chart",
  description: "Part-to-whole composition for low-cardinality categories.",

  suitability(columns, data) {
    const strs = columns.filter((c) => inferKind(data.map((r) => r[c])) === "string");
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    const uniqueStrs = strs.length > 0
      ? new Set(data.map((r) => r[strs[0]])).size
      : 0;
    // Wins for low-cardinality categoricals (2–8 slices)
    if (strs.length >= 1 && nums.length >= 1 && uniqueStrs <= 8 && uniqueStrs >= 2) return 0.72;
    return 0;
  },

  deriveConfig(columns, data) {
    const strs = columns.filter((c) => inferKind(data.map((r) => r[c])) === "string");
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    return { x: strs[0], y: nums[0] };
  },

  component: DonutChart,
};
