"use client";

import { BarChart, LineChart, ScatterPlot } from "@bi-tool/charts";
import type { ChartType } from "@bi-tool/charts";

interface Props {
  chartType: ChartType;
  columns: string[];
  rows: unknown[][];
  x?: string;
  y?: string;
}

export default function ChartView({ chartType, columns, rows, x, y }: Props) {
  if (chartType === "table" || !x || !y) return null;

  const data = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });

  if (chartType === "bar") return <BarChart data={data} x={x} y={y} />;
  if (chartType === "line") return <LineChart data={data} x={x} y={y} />;
  if (chartType === "scatter") return <ScatterPlot data={data} x={x} y={y} />;
  return null;
}
