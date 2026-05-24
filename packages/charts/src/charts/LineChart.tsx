"use client";

import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";

interface Props {
  data: Record<string, unknown>[];
  x: string;
  y: string;
}

export function LineChart({ data, x, y }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !data.length) return;
    const coerced = data.map((d) => ({ ...d, [x]: new Date(d[x] as string) }));
    const plot = Plot.plot({
      width: ref.current.offsetWidth || 600,
      marks: [
        Plot.lineY(coerced, { x, y, stroke: "#6366f1", strokeWidth: 2 }),
        Plot.dotY(coerced, { x, y, fill: "#6366f1", r: 3 }),
        Plot.gridY(),
      ],
      x: { type: "utc", label: x },
      y: { label: y },
      style: { background: "transparent", color: "#d1d5db" },
    });
    ref.current.appendChild(plot);
    return () => plot.remove();
  }, [data, x, y]);

  return <div ref={ref} className="w-full overflow-x-auto" />;
}
