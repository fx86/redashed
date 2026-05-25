"use client";

import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { ChartProps, ChartDefinition, ChartBaseConfig } from "../registry";
import { inferKind } from "../utils/infer";
import { fmt } from "../utils/fmt";

export interface HeatmapConfig extends ChartBaseConfig {
  fill?: string;
}

export function Heatmap({ data, config, theme }: ChartProps<HeatmapConfig>) {
  const { x = "", y = "", fill = "" } = config;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!ref.current || !data.length || !x || !y || !fill || !width) return;

    const vals = data.map((d) => d[fill] as number);
    const max = Math.max(...vals);

    const plot = Plot.plot({
      marginTop: 16,
      marginRight: 24,
      marginBottom: 48,
      marginLeft: 80,
      width,
      color: {
        type: "linear",
        domain: [0, max],
        range: [theme.muted, theme.accent],
      },
      marks: [
        Plot.cell(data, {
          x,
          y,
          fill,
          inset: 0.5,
        }),
        Plot.text(data, {
          x,
          y,
          text: (d: Record<string, unknown>) => fmt(d[fill]),
          fill: theme.background === "transparent" ? theme.axis : theme.background,
          fontSize: 10,
        }),
      ],
      x: { label: null, tickSize: 0 },
      y: { label: null, tickSize: 0 },
      style: {
        background: theme.background,
        color: theme.axis,
        fontSize: theme.fontSize,
        fontFamily: theme.fontFamily,
      },
    });

    ref.current.appendChild(plot);
    return () => plot.remove();
  }, [data, x, y, fill, theme, width]);

  return <div ref={ref} className="w-full" />;
}

export const heatmapDefinition: ChartDefinition<HeatmapConfig> = {
  type: "heatmap",
  name: "Heatmap",
  description: "Two categorical dimensions with a numeric colour intensity.",

  suitability(columns, data) {
    const strs = columns.filter((c) => inferKind(data.map((r) => r[c])) === "string");
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    if (strs.length >= 2 && nums.length >= 1) return 0.85;
    return 0;
  },

  deriveConfig(columns, data) {
    const strs = columns.filter((c) => inferKind(data.map((r) => r[c])) === "string");
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    const card = (col: string) => new Set(data.map((r) => r[col])).size;
    // Lower cardinality → column axis; higher → row axis
    const sorted = [...strs].sort((a, b) => card(a) - card(b));
    return { x: sorted[0], y: sorted[1] ?? strs[1], fill: nums[0] };
  },

  component: Heatmap,
};
