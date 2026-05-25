export function fmt(n: unknown): string {
  const v = Number(n);
  if (!isFinite(v)) return String(n);
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
