export interface ThemeSpec {
  /** Primary data mark colour — bars, lines, dots. */
  ink: string;
  /** One focal accent — highlighted bar, end-point dot, leading mark. */
  accent: string;
  /** Non-focal marks — secondary bars, context lines. */
  muted: string;
  /** Gridlines. Keep near-invisible. */
  grid: string;
  /** Axis lines and tick labels. */
  axis: string;
  /** Chart background. "transparent" inherits the page surface. */
  background: string;
  /** CSS font-size string, e.g. "11px". */
  fontSize: string;
  /** CSS font-family string. */
  fontFamily: string;
  /**
   * Fill strategy for bar/area charts.
   * "max"     — accent the single peak value, mute the rest  (Tufte)
   * "uniform" — all marks use ink, no highlighting           (Economist, FT)
   * "none"    — all marks use muted                          (minimal reference)
   */
  highlightMode: string;
  /** Arbitrary extra tokens for chart-specific or custom-theme needs. */
  [key: string]: string;
}

export const tufteDark: ThemeSpec = {
  ink:           "#64748b",
  accent:        "#94a3b8",
  muted:         "#1e293b",
  grid:          "#1f2937",
  axis:          "#374151",
  background:    "transparent",
  fontSize:      "11px",
  fontFamily:    "ui-monospace, monospace",
  highlightMode: "max",
};

export const tufteLight: ThemeSpec = {
  ink:           "#374151",
  accent:        "#b3261e",
  muted:         "#d1cfc9",
  grid:          "#e5e1d8",
  axis:          "#6b665d",
  background:    "#fafaf7",
  fontSize:      "11px",
  fontFamily:    '"Charter", "Iowan Old Style", Georgia, serif',
  highlightMode: "max",
};

export const economist: ThemeSpec = {
  ink:           "#E3120B",
  accent:        "#E3120B",
  muted:         "#f4a99a",
  grid:          "#e5e7eb",
  axis:          "#374151",
  background:    "#ffffff",
  fontSize:      "11px",
  fontFamily:    '"Franklin Gothic Medium", "Arial Narrow", Arial, sans-serif',
  highlightMode: "uniform",
};

export const financialTimes: ThemeSpec = {
  ink:           "#0F5499",
  accent:        "#0F5499",
  muted:         "#a8c4da",
  grid:          "#c9b49a",
  axis:          "#4d3c2f",
  background:    "#FFF1E5",
  fontSize:      "11px",
  fontFamily:    '"Metric", "Helvetica Neue", Arial, sans-serif',
  highlightMode: "uniform",
};

/** All built-in themes keyed by their registry name. */
export const builtinThemes: Record<string, ThemeSpec> = {
  "tufte-dark":      tufteDark,
  "tufte-light":     tufteLight,
  "economist":       economist,
  "financial-times": financialTimes,
};

/** Human-readable labels for the built-in theme keys. */
export const THEME_LABELS: Record<string, string> = {
  "tufte-dark":      "Tufte Dark",
  "tufte-light":     "Tufte Light",
  "economist":       "Economist",
  "financial-times": "Financial Times",
};
