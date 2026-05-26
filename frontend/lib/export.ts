function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
  // UTF-8 BOM so Excel/Numbers open correctly; data: URI so Safari respects the filename
  const content = "﻿" + lines.join("\r\n");
  triggerDownload(
    "data:text/csv;charset=utf-8," + encodeURIComponent(content),
    filename,
  );
}

export async function downloadChartImage(container: HTMLElement, filename = "chart.png") {
  const svg = container.querySelector("svg");
  if (!svg) return;

  const w = parseFloat(svg.getAttribute("width") ?? "") || Math.round(svg.getBoundingClientRect().width) || 800;
  const h = parseFloat(svg.getAttribute("height") ?? "") || Math.round(svg.getBoundingClientRect().height) || 400;

  const clone = svg.cloneNode(true) as SVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.querySelectorAll("script").forEach((s) => s.remove());

  const svgDataURI =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(new XMLSerializer().serializeToString(clone));

  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#0a0f1a";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      // toDataURL is synchronous — stays within the user-gesture context
      triggerDownload(canvas.toDataURL("image/png"), filename);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = svgDataURI;
  });
}

export function slugFilename(question: string, ext: string): string {
  const base =
    question
      .slice(0, 50)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "query";
  return `${base}.${ext}`;
}
