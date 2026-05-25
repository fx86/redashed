import type React from "react";
import type { ThemeSpec } from "./theme";

export interface ChartBaseConfig {
  x?: string;
  y?: string;
}

/** Props every chart component receives. */
export interface ChartProps<Config extends ChartBaseConfig = ChartBaseConfig> {
  /** Rows as objects, keyed by column name. */
  data: Record<string, unknown>[];
  /** Column names in order — same as Object.keys(data[0]). */
  columns: string[];
  /** Dimension config auto-derived by selectChartType, or overridden by the user. */
  config: Config;
  /** Active theme tokens — never hardcode colors in a chart component. */
  theme: ThemeSpec;
}

/** Contract every chart — built-in or user-created — must implement. */
export interface ChartDefinition<Config extends ChartBaseConfig = ChartBaseConfig> {
  /** Unique identifier. Used as the stored chart_type value. */
  type: string;
  /** Human-readable label shown in chart pickers. */
  name: string;
  /** One sentence: when to use this chart. */
  description: string;
  /**
   * Returns a 0–1 fitness score for the given data shape.
   * selectChartType picks the highest scorer above 0.3.
   * Return 0 if this chart cannot represent the data at all.
   */
  suitability: (columns: string[], data: Record<string, unknown>[]) => number;
  /**
   * Auto-derives dimension config from the data.
   * selectChartType calls this on the winning chart to produce { x, y, ... }.
   * Return {} if the chart doesn't need auto-config.
   */
  deriveConfig: (columns: string[], data: Record<string, unknown>[]) => Partial<Config>;
  /** The React component that renders this chart. */
  component: React.ComponentType<ChartProps<Config>>;
}

export class ChartRegistry {
  private readonly defs = new Map<string, ChartDefinition>();

  register(def: ChartDefinition | ChartDefinition[]): this {
    const items = Array.isArray(def) ? def : [def];
    for (const d of items) this.defs.set(d.type, d);
    return this;
  }

  get(type: string): ChartDefinition | undefined {
    return this.defs.get(type);
  }

  all(): ChartDefinition[] {
    return Array.from(this.defs.values());
  }

  has(type: string): boolean {
    return this.defs.has(type);
  }
}

export function createRegistry(defs: ChartDefinition[] = []): ChartRegistry {
  return new ChartRegistry().register(defs);
}
