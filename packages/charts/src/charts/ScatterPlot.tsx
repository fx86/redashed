"use client";

import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";

interface Props {
  data: Record<string, unknown>[];
  x: string;
  y: string;
}

export function ScatterPlot({ data, x, y }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !data.length) return;
    const plot = Plot.plot({
      width: ref.current.offsetWidth || 600,
      marks: [
        Plot.dot(data, { x, y, fill: "#6366f1", fillOpacity: 0.7, r: 4 }),
        Plot.gridX(),
        Plot.gridY(),
      ],
      x: { label: x },
      y: { label: y },
      style: { background: "transparent", color: "#d1d5db" },
    });
    ref.current.appendChild(plot);
    return () => plot.remove();
  }, [data, x, y]);

  return <div ref={ref} className="w-full overflow-x-auto" />;
}
