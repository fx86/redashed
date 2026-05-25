"use client";

import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import type { ChartProps, ChartDefinition } from "../registry";
import { inferKind } from "../utils/infer";
import { fmt } from "../utils/fmt";

export function LineChart({ data, config, theme }: ChartProps) {
  const { x = "", y = "" } = config;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !data.length || !x || !y) return;

    const coerced = data.map((d) => ({ ...d, [x]: new Date(d[x] as string) }));
    const vals = coerced.map((d) => d[y] as number);
    const minY = Math.min(...vals);
    const maxY = Math.max(...vals);
    const last = coerced[coerced.length - 1];
    const mode = theme.highlightMode ?? "max";

    const marks: Plot.Markish[] = [
      Plot.lineY(coerced, { x, y, stroke: theme.ink, strokeWidth: 1.5 }),
    ];

    // "uniform" / "none" — clean line with no accent dot
    if (mode === "max") {
      marks.push(
        Plot.dot([last], { x, y, fill: theme.accent, r: 3, stroke: "none" }),
        Plot.text([last], {
          x,
          y,
          text: () => fmt(last[y]),
          dx: 8,
          textAnchor: "start",
          fill: theme.axis,
          fontSize: 11,
        }),
      );
    }

    const plot = Plot.plot({
      marginTop: 16,
      marginRight: mode === "max" ? 56 : 24,
      marginBottom: 24,
      marginLeft: 48,
      width: ref.current.offsetWidth || 600,
      marks,
      x: { type: "utc", label: null, tickSize: 0, ticks: 4 },
      y: {
        label: null,
        tickSize: 0,
        ticks: [minY, maxY],
        tickFormat: (d) => fmt(d),
        domain: [minY, maxY],
      },
      style: {
        background: theme.background,
        color: theme.axis,
        fontSize: theme.fontSize,
        fontFamily: theme.fontFamily,
      },
    });

    ref.current.appendChild(plot);
    return () => plot.remove();
  }, [data, x, y, theme]);

  return <div ref={ref} className="w-full" />;
}

export const lineDefinition: ChartDefinition = {
  type: "line",
  name: "Line Chart",
  description: "Trend over time. Requires at least one date and one numeric column.",

  suitability(columns, data) {
    const dates = columns.filter((c) => inferKind(data.map((r) => r[c])) === "date");
    const nums  = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    if (dates.length >= 1 && nums.length >= 1) return 0.9;
    return 0;
  },

  deriveConfig(columns, data) {
    const dates = columns.filter((c) => inferKind(data.map((r) => r[c])) === "date");
    const nums  = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    return { x: dates[0], y: nums[0] };
  },

  component: LineChart,
};
