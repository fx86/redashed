import { inferKind } from "./infer";

export function coerceData(
  columns: string[],
  data: Record<string, unknown>[]
): Record<string, unknown>[] {
  if (!data.length) return data;

  const kinds = Object.fromEntries(
    columns.map((col) => [col, inferKind(data.map((r) => r[col]))])
  );

  return data.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const col of columns) {
      const v = row[col];
      if (v == null || v === "") { out[col] = null; continue; }
      const kind = kinds[col];
      if (kind === "number") out[col] = Number(v);
      else if (kind === "date") out[col] = new Date(v as string);
    }
    return out;
  });
}
