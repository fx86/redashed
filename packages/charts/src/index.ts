// Registry
export { ChartRegistry, createRegistry } from "./registry";
export type { ChartDefinition, ChartProps, ChartBaseConfig } from "./registry";

// Theme
export { tufteDark, tufteLight, economist, financialTimes, builtinThemes, THEME_LABELS } from "./theme";
export type { ThemeSpec } from "./theme";

// Theme registry
export { ThemeRegistry, createThemeRegistry } from "./theme-registry";

// Context + hooks
export { ChartProvider, useChartContext, useRegistry, useThemeRegistry, useChartTheme } from "./context";

// Chart selection
export { selectChartType } from "./utils/selectChartType";
export type { ChartType, ChartConfig } from "./utils/selectChartType";

// Utilities (useful for custom chart authors)
export { fmt } from "./utils/fmt";
export { inferKind } from "./utils/infer";
export type { ColKind } from "./utils/infer";
export { coerceData } from "./utils/coerce";

// Built-in charts — components and definitions
export { BarChart, barDefinition } from "./charts/BarChart";
export { LineChart, lineDefinition } from "./charts/LineChart";
export { ScatterPlot, scatterDefinition } from "./charts/ScatterPlot";
export { AreaChart, areaDefinition } from "./charts/AreaChart";
export { Histogram, histogramDefinition } from "./charts/Histogram";
export type { HistogramConfig } from "./charts/Histogram";
export { Heatmap, heatmapDefinition } from "./charts/Heatmap";
export type { HeatmapConfig } from "./charts/Heatmap";
export { DonutChart, donutDefinition } from "./charts/DonutChart";
export { KPITile, kpiDefinition } from "./charts/KPITile";
export type { KPIConfig } from "./charts/KPITile";
export { PivotTable, pivotDefinition } from "./charts/PivotTable";
export type { PivotConfig } from "./charts/PivotTable";

// Convenience: all built-in definitions in one array for createRegistry()
import { barDefinition } from "./charts/BarChart";
import { lineDefinition } from "./charts/LineChart";
import { scatterDefinition } from "./charts/ScatterPlot";
import { areaDefinition } from "./charts/AreaChart";
import { histogramDefinition } from "./charts/Histogram";
import { heatmapDefinition } from "./charts/Heatmap";
import { donutDefinition } from "./charts/DonutChart";
import { kpiDefinition } from "./charts/KPITile";
import { pivotDefinition } from "./charts/PivotTable";
import type { ChartDefinition } from "./registry";

export const builtinCharts: ChartDefinition[] = [
  kpiDefinition,       // highest suitability for single-row aggregates
  lineDefinition,      // date + number → 0.9
  histogramDefinition, // single numeric distribution → 0.85
  heatmapDefinition,   // 2 categoricals + numeric → 0.85
  barDefinition,       // categorical + numeric → 0.8
  areaDefinition,      // date + number → 0.75 (below line)
  donutDefinition,     // low-cardinality categorical → 0.72
  scatterDefinition,   // 2 numerics → 0.7
  pivotDefinition,     // 2+ categoricals + numeric → 0.5 (user-selected)
];
