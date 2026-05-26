"use client";

import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { ChartProps, ChartDefinition } from "../registry";
import { inferKind } from "../utils/infer";
import { fmt } from "../utils/fmt";

export function AreaChart({ data, config, theme }: ChartProps) {
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

    const xIsDate = data[0][x] instanceof Date;
    const vals = data.map((d) => d[y] as number).filter(isFinite);
    if (!vals.length) return;
    const minY = Math.min(...vals);
    const maxY = Math.max(...vals);

    const plot = Plot.plot({
      marginTop: 16,
      marginRight: 24,
      marginBottom: 36,
      marginLeft: 48,
      width,
      height,
      marks: [
        Plot.areaY(data, {
          x,
          y,
          fill: theme.ink,
          fillOpacity: 0.12,
        }),
        Plot.lineY(data, {
          x,
          y,
          stroke: theme.ink,
          strokeWidth: 1.5,
        }),
      ],
      x: xIsDate
        ? { type: "utc", label: null, tickSize: 0, ticks: 4 }
        : { label: null, tickSize: 0 },
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

export const areaDefinition: ChartDefinition = {
  type: "area",
  name: "Area Chart",
  description: "Time series with filled area — emphasises volume over rate.",

  suitability(columns, data) {
    const dates = columns.filter((c) => inferKind(data.map((r) => r[c])) === "date");
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    if (dates.length >= 1 && nums.length >= 1) return 0.75;
    if (nums.length >= 2) return 0.3;
    return 0;
  },

  deriveConfig(columns, data) {
    const dates = columns.filter((c) => inferKind(data.map((r) => r[c])) === "date");
    const nums = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    if (dates.length >= 1 && nums.length >= 1) return { x: dates[0], y: nums[0] };
    if (nums.length >= 2) return { x: nums[0], y: nums[1] };
    if (nums.length === 1) return { x: columns.find((c) => !nums.includes(c)) ?? columns[0], y: nums[0] };
    return { x: columns[0] ?? "", y: columns[1] ?? columns[0] ?? "" };
  },

  component: AreaChart,
};
