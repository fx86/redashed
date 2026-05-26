"use client";

import { useRegistry, useChartTheme, useThemeRegistry, coerceData } from "@bi-tool/charts";
import type { ChartType, ChartConfig } from "@bi-tool/charts";

interface Props {
  chartType: ChartType;
  columns: string[];
  rows: unknown[][];
  config: ChartConfig;
}

export default function ChartView({ chartType, columns, rows, config }: Props) {
  const registry = useRegistry();
  const defaultTheme = useChartTheme();
  const themeRegistry = useThemeRegistry();

  if (chartType === "table") return null;

  const def = registry.get(chartType);
  if (!def) return null;

  const baseTheme =
    config.themeName && themeRegistry.has(config.themeName)
      ? themeRegistry.get(config.themeName)!
      : defaultTheme;

  // Per-chart highlightMode override takes precedence over theme default
  const theme = config.highlightMode
    ? { ...baseTheme, highlightMode: config.highlightMode }
    : baseTheme;

  const raw = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = (row as unknown[])[i]; });
    return obj;
  });
  const data = coerceData(columns, raw);

  const Component = def.component;
  return <Component data={data} columns={columns} config={config} theme={theme} />;
}
