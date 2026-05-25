import type { ChartRegistry } from "../registry";

export type ChartType = string;

export interface ChartConfig {
  type: ChartType;
  // Common axis columns
  x?: string;
  y?: string;
  // Heatmap colour column
  fill?: string;
  // KPI metric + comparison
  value?: string;
  delta?: string;
  // Histogram bin count
  thresholds?: number;
  // Pivot dimensions
  rows?: string[];
  col?: string;
  conditionalFormat?: string;
  showTotals?: boolean;
  showPct?: boolean;
  /** Key in the ThemeRegistry. Falls back to context default if absent or unregistered. */
  themeName?: string;
  /** Overrides the theme's highlightMode for this chart only. */
  highlightMode?: string;
  /** Allows arbitrary extra keys so ChartConfig is assignable to Record<string, unknown>. */
  [key: string]: unknown;
}

/**
 * Selects the best chart type for the given data.
 *
 * Each registered chart's suitability() score is evaluated and the highest
 * scorer above 0.3 wins. Its deriveConfig() then produces the x/y config.
 * User-registered charts participate in auto-selection automatically.
 *
 * Falls back to "table" when no chart scores above 0.3.
 */
export function selectChartType(
  columns: string[],
  rows: Record<string, unknown>[],
  registry: ChartRegistry,
): ChartConfig {
  if (!columns.length || !rows.length) return { type: "table" };

  const scored = registry
    .all()
    .map((def) => ({ def, score: def.suitability(columns, rows) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score <= 0.3) return { type: "table" };

  const derived = best.def.deriveConfig(columns, rows);
  return { type: best.def.type, ...derived };
}
