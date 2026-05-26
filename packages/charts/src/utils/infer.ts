export type ColKind = "date" | "number" | "string" | "unknown";

export function inferKind(values: unknown[]): ColKind {
  const sample = values.find((v) => v != null);
  if (sample == null) return "unknown";
  if (typeof sample === "number") return "number";
  if (typeof sample === "string" && /^\d{4}-\d{2}-\d{2}/.test(sample)) return "date";
  if (typeof sample === "string" && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(sample.trim())) return "number";
  return "string";
}
