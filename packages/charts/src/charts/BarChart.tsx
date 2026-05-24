"use client";

import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";

interface Props {
  data: Record<string, unknown>[];
  x: string;
  y: string;
}

export function BarChart({ data, x, y }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !data.length) return;
    const plot = Plot.plot({
      marginLeft: 120,
      width: ref.current.offsetWidth || 600,
      marks: [
        Plot.barX(data, { y: x, x: y, fill: "#6366f1", sort: { y: "-x" } }),
        Plot.gridX(),
      ],
      x: { label: y },
      y: { label: x },
      style: { background: "transparent", color: "#d1d5db" },
    });
    ref.current.appendChild(plot);
    return () => plot.remove();
  }, [data, x, y]);

  return <div ref={ref} className="w-full overflow-x-auto" />;
}
