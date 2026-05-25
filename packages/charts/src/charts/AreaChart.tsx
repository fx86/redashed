"use client";

import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import type { ChartProps, ChartDefinition } from "../registry";
import { inferKind } from "../utils/infer";
import { fmt } from "../utils/fmt";

export function AreaChart({ data, config, theme }: ChartProps) {
  const { x = "", y = "" } = config;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !data.length || !x || !y) return;

    const coerced = data.map((d) => ({ ...d, [x]: new Date(d[x] as string) }));
    const vals = coerced.map((d) => d[y] as number);
    const minY = Math.min(...vals);
    const maxY = Math.max(...vals);

    const plot = Plot.plot({
      marginTop: 16,
      marginRight: 24,
      marginBottom: 24,
      marginLeft: 48,
      width: ref.current.offsetWidth || 600,
      marks: [
        Plot.areaY(coerced, {
          x,
          y,
          fill: theme.ink,
          fillOpacity: 0.12,
        }),
        Plot.lineY(coerced, {
          x,
          y,
          stroke: theme.ink,
          strokeWidth: 1.5,
        }),
      ],
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

export const areaDefinition: ChartDefinition = {
  type: "area",
  name: "Area Chart",
  description: "Time series with filled area — emphasises volume over rate.",

  suitability(columns, data) {
    const dates = columns.filter((c) => inferKind(data.map((r) => r[c])) === "date");
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    // Scores below line (0.9) so line wins auto-selection; area available via user override
    if (dates.length >= 1 && nums.length >= 1) return 0.75;
    return 0;
  },

  deriveConfig(columns, data) {
    const dates = columns.filter((c) => inferKind(data.map((r) => r[c])) === "date");
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    return { x: dates[0], y: nums[0] };
  },

  component: AreaChart,
};
