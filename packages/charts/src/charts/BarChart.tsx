"use client";

import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { ChartProps, ChartDefinition } from "../registry";
import { inferKind } from "../utils/infer";
import { fmt } from "../utils/fmt";

export function BarChart({ data, config, theme }: ChartProps) {
  const { x = "", y = "" } = config;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
      setHeight(entry.contentRect.height);
    });
    ro.observe(el);
    setWidth(el.offsetWidth);
    setHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!ref.current || !data.length || !x || !y || !width || !height) return;

    const sorted = [...data].sort((a, b) => (b[y] as number) - (a[y] as number));
    const max = Math.max(...sorted.map((d) => d[y] as number));
    const mode = theme.highlightMode ?? "max";

    function barFill(d: Record<string, unknown>): string {
      if (mode === "uniform") return theme.ink;
      if (mode === "none")    return theme.muted;
      // "max" — accent the peak bar, mute the rest
      return d[y] === max ? theme.accent : theme.muted;
    }

    const plot = Plot.plot({
      marginLeft: 130,
      marginRight: 72,
      marginTop: 8,
      marginBottom: 8,
      width,
      height,
      marks: [
        Plot.ruleX([0], { stroke: theme.axis, strokeWidth: 0.5 }),
        Plot.barX(sorted, { y: x, x: y, fill: barFill }),
        Plot.text(sorted, {
          y: x,
          x: y,
          text: (d: Record<string, unknown>) => fmt(d[y]),
          dx: 6,
          textAnchor: "start",
          fill: theme.axis,
          fontSize: 11,
        }),
      ],
      x: { axis: null, label: null },
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
  }, [data, x, y, theme, width, height]);

  return <div ref={ref} className="w-full h-full" />;
}

export const barDefinition: ChartDefinition = {
  type: "bar",
  name: "Bar Chart",
  description: "Horizontal bars for categorical comparison, sorted by value.",

  suitability(columns, data) {
    const strs = columns.filter((c) => inferKind(data.map((r) => r[c])) === "string");
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    if (strs.length >= 1 && nums.length >= 1 && data.length <= 100) return 0.8;
    return 0;
  },

  deriveConfig(columns, data) {
    const strs = columns.filter((c) => inferKind(data.map((r) => r[c])) === "string");
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    return { x: strs[0], y: nums[0] };
  },

  component: BarChart,
};
