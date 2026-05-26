function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export function downloadCSV(columns: string[], rows: unknown[][], filename = "query-results.csv") {
  function escape(v: unknown): string {
    const s = v == null ? "" : String(v);
    return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  const lines = [
    columns.map(escape).join(","),
    ...rows.map((row) => (row as unknown[]).map(escape).join(",")),
  ];
  triggerDownload(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }), filename);
}

export async function downloadChartImage(container: HTMLElement, filename = "chart.png") {
  const svg = container.querySelector("svg");
  if (!svg) return;

  const rect = svg.getBoundingClientRect();
  const w = Math.round(rect.width) || 800;
  const h = Math.round(rect.height) || 400;

  const clone = svg.cloneNode(true) as SVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));

  const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#0a0f1a";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);

      canvas.toBlob((blob) => {
        if (blob) triggerDownload(blob, filename);
        resolve();
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(svgUrl); resolve(); };
    img.src = svgUrl;
  });
}

export function slugFilename(question: string, ext: string): string {
  const base = question
    .slice(0, 50)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "query";
  return `${base}.${ext}`;
}
