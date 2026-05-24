export type ChartType = "bar" | "line" | "scatter" | "table";

export interface ChartConfig {
  type: ChartType;
  x?: string;
  y?: string;
}

type ColKind = "date" | "number" | "string" | "unknown";

function inferKind(values: unknown[]): ColKind {
  const sample = values.find((v) => v != null);
  if (sample == null) return "unknown";
  if (typeof sample === "number") return "number";
  if (typeof sample === "string" && /^\d{4}-\d{2}-\d{2}/.test(sample))
    return "date";
  return "string";
}

export function selectChartType(
  columns: string[],
  rows: Record<string, unknown>[]
): ChartConfig {
  if (!columns.length || !rows.length) return { type: "table" };

  const kinds = columns.map((col) => ({
    name: col,
    kind: inferKind(rows.map((r) => r[col])),
  }));

  const dates = kinds.filter((c) => c.kind === "date");
  const nums = kinds.filter((c) => c.kind === "number");
  const strs = kinds.filter((c) => c.kind === "string");

  if (dates.length >= 1 && nums.length >= 1)
    return { type: "line", x: dates[0].name, y: nums[0].name };

  if (strs.length >= 1 && nums.length >= 1 && rows.length <= 100)
    return { type: "bar", x: strs[0].name, y: nums[0].name };

  if (nums.length >= 2)
    return { type: "scatter", x: nums[0].name, y: nums[1].name };

  return { type: "table" };
}
