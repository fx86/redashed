"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";
import type { Upload } from "@/lib/api";

interface Props {
  jwt: string;
  onUpload: (upload: Upload) => void;
}

const SEPARATOR_PRESETS = [
  { label: "Comma  ,", value: "," },
  { label: "Semicolon  ;", value: ";" },
  { label: "Tab  \\t", value: "\\t" },
  { label: "Pipe  |", value: "|" },
  { label: "Custom", value: "__custom__" },
];

function parseSep(raw: string): string {
  return raw === "\\t" ? "\t" : raw;
}

function parsePreview(text: string, sep: string, maxRows = 8) {
  const lines = text.split("\n").filter((l) => l.trim());
  const headers = lines[0]?.split(sep).map((h) => h.replace(/^"|"$/g, "").trim()) ?? [];
  const rows = lines.slice(1, maxRows + 1).map((l) =>
    l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim())
  );
  return { headers, rows };
}

function guessTableName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50) || "upload";
}

export default function FileUpload({ jwt, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [sepPreset, setSepPreset] = useState(",");
  const [customSep, setCustomSep] = useState("");
  const [tableName, setTableName] = useState("");
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const separator = sepPreset === "__custom__" ? customSep : sepPreset;

  function selectFile(f: File) {
    setFile(f);
    setTableName(guessTableName(f.name));
    setError(null);
    setPreview(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? "";
      const sep = parseSep(sepPreset === "__custom__" ? customSep : sepPreset);
      setPreview(parsePreview(text, sep));
    };
    reader.readAsText(f.slice(0, 64 * 1024));
  }

  function refreshPreview(sep: string) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? "";
      setPreview(parsePreview(text, parseSep(sep)));
    };
    reader.readAsText(file.slice(0, 64 * 1024));
  }

  function onSepChange(val: string) {
    setSepPreset(val);
    if (val !== "__custom__") refreshPreview(val);
  }

  function onCustomSepChange(val: string) {
    setCustomSep(val);
    if (val) refreshPreview(val);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) selectFile(f);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) selectFile(f);
    e.target.value = "";
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setError(null);
    setSepPreset(",");
    setCustomSep("");
    setTableName("");
  }

  async function handleUpload() {
    if (!file || !separator) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("separator", separator);
      if (tableName) form.append("table_name", tableName);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? `Upload failed (${res.status})`);
      }
      const upload: Upload = await res.json();
      onUpload(upload);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {!file ? (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragging ? "border-indigo-500 bg-indigo-950/30" : "border-gray-700 hover:border-gray-600"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,.dat" className="hidden" onChange={onInputChange} />
          <p className="text-sm text-gray-400">Drop a flat file here or <span className="text-indigo-400">click to select</span></p>
          <p className="text-xs text-gray-600 mt-1">CSV, TSV, pipe-delimited, or any character-separated file · max 50 MB</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileIcon />
              <div className="min-w-0">
                <p className="text-sm text-gray-200 truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button onClick={reset} className="text-gray-600 hover:text-gray-400 text-xs flex-shrink-0 ml-3">✕</button>
          </div>

          {/* Separator */}
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Separator</p>
            <div className="flex flex-wrap gap-1.5">
              {SEPARATOR_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => onSepChange(p.value)}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    sepPreset === p.value
                      ? "border-indigo-500 bg-indigo-950/60 text-indigo-300"
                      : "border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {sepPreset === "__custom__" && (
              <input
                className="mt-2 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 w-24 outline-none focus:border-indigo-500"
                placeholder="e.g.  ^"
                maxLength={3}
                value={customSep}
                onChange={(e) => onCustomSepChange(e.target.value)}
              />
            )}
          </div>

          {/* Table name */}
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Table name</p>
            <input
              className="bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 w-full outline-none focus:border-indigo-500"
              placeholder="my_table"
              value={tableName}
              onChange={(e) => setTableName(e.target.value.replace(/[^a-z0-9_]/g, "_"))}
            />
          </div>

          {/* Preview */}
          {preview && preview.headers.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">{preview.headers.length} columns · preview</p>
              <div className="overflow-x-auto rounded border border-gray-800 max-h-40">
                <table className="text-[11px] w-full">
                  <thead>
                    <tr className="bg-gray-900 sticky top-0">
                      {preview.headers.map((h, i) => (
                        <th key={i} className="text-left px-2 py-1 text-gray-400 font-medium whitespace-nowrap border-b border-gray-800">
                          {h || `col_${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-gray-800/50 last:border-0">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-2 py-1 text-gray-300 whitespace-nowrap max-w-[160px] truncate">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded px-3 py-2">{error}</p>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading || !separator || (sepPreset === "__custom__" && !customSep)}
            className="w-full py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {uploading ? "Uploading…" : "Upload & create table"}
          </button>
        </div>
      )}
    </div>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-500 flex-shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
