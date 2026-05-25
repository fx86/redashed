"use client";

import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import type { ChartProps, ChartDefinition, ChartBaseConfig } from "../registry";
import { inferKind } from "../utils/infer";
import { fmt } from "../utils/fmt";

export interface HistogramConfig extends ChartBaseConfig {
  thresholds?: number;
}

export function Histogram({ data, config, theme }: ChartProps<HistogramConfig>) {
  const { x = "", thresholds = 20 } = config;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !data.length || !x) return;

    const mode = theme.highlightMode ?? "max";
    const fillColor = mode === "uniform" ? theme.ink : theme.muted;

    const plot = Plot.plot({
      marginTop: 16,
      marginRight: 24,
      marginBottom: 32,
      marginLeft: 48,
      width: ref.current.offsetWidth || 600,
      marks: [
        Plot.rectY(data, {
          ...Plot.binX({ y: "count" }, { x, thresholds }),
          fill: fillColor,
          stroke: "none",
        } as Parameters<typeof Plot.rectY>[1]),
        Plot.ruleY([0], { stroke: theme.axis, strokeWidth: 0.5 }),
      ],
      x: { label: x, tickSize: 0, tickFormat: (d) => fmt(d) },
      y: { label: "count", tickSize: 0 },
      style: {
        background: theme.background,
        color: theme.axis,
        fontSize: theme.fontSize,
        fontFamily: theme.fontFamily,
      },
    });

    ref.current.appendChild(plot);
    return () => plot.remove();
  }, [data, x, thresholds, theme]);

  return <div ref={ref} className="w-full" />;
}

export const histogramDefinition: ChartDefinition<HistogramConfig> = {
  type: "histogram",
  name: "Histogram",
  description: "Distribution of a single numeric column — auto-binned.",

  suitability(columns, data) {
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    const strs = columns.filter((c) => inferKind(data.map((r) => r[c])) === "string");
    if (nums.length === 1 && strs.length === 0 && data.length > 20) return 0.85;
    return 0;
  },

  deriveConfig(columns, data) {
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    return { x: nums[0] };
  },

  component: Histogram,
};
