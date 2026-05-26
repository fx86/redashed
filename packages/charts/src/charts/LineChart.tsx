"use client";

import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { ChartProps, ChartDefinition } from "../registry";
import { inferKind } from "../utils/infer";
import { fmt } from "../utils/fmt";

export function LineChart({ data, config, theme }: ChartProps) {
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
    const last = data[data.length - 1];
    const mode = theme.highlightMode ?? "max";

    const marks: Plot.Markish[] = [
      Plot.lineY(data, { x, y, stroke: theme.ink, strokeWidth: 1.5 }),
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
      marginBottom: 36,
      marginLeft: 48,
      width,
      height,
      marks,
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

export const lineDefinition: ChartDefinition = {
  type: "line",
  name: "Line Chart",
  description: "Trend over time. Requires at least one date and one numeric column.",

  suitability(columns, data) {
    const dates = columns.filter((c) => inferKind(data.map((r) => r[c])) === "date");
    const nums  = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    if (dates.length >= 1 && nums.length >= 1) return 0.9;
    if (nums.length >= 2) return 0.4;
    return 0;
  },

  deriveConfig(columns, data) {
    const dates = columns.filter((c) => inferKind(data.map((r) => r[c])) === "date");
    const nums  = columns.filter((c) => inferKind(data.map((r) => r[c])) === "number");
    if (dates.length >= 1 && nums.length >= 1) return { x: dates[0], y: nums[0] };
    if (nums.length >= 2) return { x: nums[0], y: nums[1] };
    if (nums.length === 1) return { x: columns.find((c) => !nums.includes(c)) ?? columns[0], y: nums[0] };
    return { x: columns[0] ?? "", y: columns[1] ?? columns[0] ?? "" };
  },

  component: LineChart,
};
