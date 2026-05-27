"use client";

import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { ChartProps, ChartDefinition } from "../registry";
import { inferKind } from "../utils/infer";
import { fmt } from "../utils/fmt";

export function ScatterPlot({ data, config, theme }: ChartProps) {
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

    const xs = data.map((d) => d[x] as number);
    const ys = data.map((d) => d[y] as number);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const mode = theme.highlightMode ?? "max";

    // "uniform" fills every dot with ink at full opacity; "max" keeps the subtle 0.6 opacity
    const fillOpacity = mode === "uniform" ? 0.8 : 0.6;

    const plot = Plot.plot({
      marginTop: 16,
      marginRight: 24,
      marginBottom: 32,
      marginLeft: 48,
      width,
      height,
      marks: [
        Plot.dot(data, {
          x,
          y,
          fill: theme.ink,
          fillOpacity,
          r: 3,
          stroke: "none",
        }),
        Plot.tip(data, Plot.pointer({ x, y, fill: theme.background, stroke: theme.axis })),
      ],
      x: {
        label: null,
        tickSize: 0,
        ticks: [minX, maxX],
        tickFormat: (d) => fmt(d),
        domain: [minX, maxX],
      },
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
  }, [data, x, y, theme, width, height]);

  return <div ref={ref} className="w-full h-full" />;
}

export const scatterDefinition: ChartDefinition = {
  type: "scatter",
  name: "Scatter Plot",
  description: "Correlation between two numeric columns.",

  suitability(columns, data) {
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    if (nums.length >= 2) return 0.7;
    return 0;
  },

  deriveConfig(columns, data) {
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    const x = nums[0] ?? columns[0] ?? "";
    const y = nums[1] ?? nums[0] ?? columns[1] ?? columns[0] ?? "";
    return { x, y };
  },

  component: ScatterPlot,
};
