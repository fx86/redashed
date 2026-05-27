"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ColKind = "text" | "dropdown" | "numeric";

export interface ColumnMeta {
  name: string;
  kind: ColKind;
  options?: string[]; // for dropdown
  min?: number;       // for numeric
  max?: number;
}

export type FilterValue =
  | { type: "text"; q: string }
  | { type: "dropdown"; selected: string[] }
  | { type: "numeric"; min: string; max: string };

export type FilterState = Record<string, FilterValue>;

// ── Helper: derive column metadata from raw result data ────────────────────────

export function deriveColumnMeta(
  columnsList: string[][],
  rowsList: unknown[][][]
): ColumnMeta[] {
  const colData: Record<string, unknown[]> = {};

  columnsList.forEach((cols, ti) => {
    cols.forEach((col, ci) => {
      if (!colData[col]) colData[col] = [];
      rowsList[ti].forEach((row) => {
        const v = row[ci];
        if (v !== null && v !== undefined && v !== "") colData[col].push(v);
      });
    });
  });

  return Object.entries(colData).map(([name, values]) => {
    // Numeric check
    if (values.length > 0 && values.every((v) => !isNaN(Number(v)))) {
      const nums = values.map(Number);
      return {
        name, kind: "numeric" as const,
        min: Math.min(...nums),
        max: Math.max(...nums),
      };
    }
    // Dropdown: ≤ 15 unique string values
    const unique = [...new Set(values.map((v) => String(v)))].sort();
    if (unique.length <= 15) {
      return { name, kind: "dropdown" as const, options: unique };
    }
    return { name, kind: "text" as const };
  });
}

// ── Helper: apply filters to a set of rows ─────────────────────────────────────

export function applyFilters(
  columns: string[],
  rows: unknown[][],
  filters: FilterState
): unknown[][] {
  const active = Object.entries(filters).filter(([col]) => columns.includes(col));
  if (active.length === 0) return rows;

  return rows.filter((row) =>
    active.every(([col, fv]) => {
      const idx = columns.indexOf(col);
      const val = row[idx];

      if (fv.type === "text") {
        if (!fv.q.trim()) return true;
        return String(val ?? "").toLowerCase().includes(fv.q.toLowerCase());
      }
      if (fv.type === "dropdown") {
        if (fv.selected.length === 0) return true;
        return fv.selected.includes(String(val ?? ""));
      }
      if (fv.type === "numeric") {
        const n = Number(val);
        const lo = fv.min !== "" ? Number(fv.min) : -Infinity;
        const hi = fv.max !== "" ? Number(fv.max) : Infinity;
        return !isNaN(n) && n >= lo && n <= hi;
      }
      return true;
    })
  );
}

// ── Filter bar ─────────────────────────────────────────────────────────────────

interface BarProps {
  columns: ColumnMeta[];
  filters: FilterState;
  onChange: (col: string, value: FilterValue | null) => void;
  onClear: () => void;
}

export function DashboardFilterBar({ columns, filters, onChange, onClear }: BarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const used = new Set(Object.keys(filters));
  const available = columns.filter((c) => !used.has(c.name));
  const activeEntries = Object.entries(filters);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function handler(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  if (columns.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-gray-800 bg-gray-900/40">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold flex-shrink-0">Filter</span>

      {/* Active filter chips */}
      {activeEntries.map(([col, fv]) => {
        const meta = columns.find((c) => c.name === col);
        return (
          <FilterChip
            key={col}
            col={col}
            meta={meta}
            value={fv}
            isEditing={editingCol === col}
            onToggleEdit={() => setEditingCol(editingCol === col ? null : col)}
            onClose={() => setEditingCol(null)}
            onChange={(v) => onChange(col, v)}
            onRemove={() => { onChange(col, null); setEditingCol(null); }}
          />
        );
      })}

      {/* Add filter button */}
      {available.length > 0 && (
        <div ref={pickerRef} className="relative">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-200 px-2.5 py-1 rounded-full border border-dashed border-gray-700 hover:border-gray-500 transition-colors"
          >
            <PlusIcon /> Add filter
          </button>

          {pickerOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-40 w-52 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
              <p className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-800">
                Filter by column
              </p>
              <ul className="max-h-52 overflow-y-auto py-1">
                {available.map((c) => (
                  <li key={c.name}>
                    <button
                      onClick={() => {
                        const initial: FilterValue =
                          c.kind === "numeric"
                            ? { type: "numeric", min: "", max: "" }
                            : c.kind === "dropdown"
                            ? { type: "dropdown", selected: [] }
                            : { type: "text", q: "" };
                        onChange(c.name, initial);
                        setEditingCol(c.name);
                        setPickerOpen(false);
                      }}
                      className="w-full text-left flex items-center justify-between px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="text-[10px] text-gray-600 flex-shrink-0 ml-2">{c.kind}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Clear all */}
      {activeEntries.length > 0 && (
        <button
          onClick={onClear}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors ml-1"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

// ── Filter chip ────────────────────────────────────────────────────────────────

function FilterChip({
  col, meta, value, isEditing,
  onToggleEdit, onClose, onChange, onRemove,
}: {
  col: string;
  meta: ColumnMeta | undefined;
  value: FilterValue;
  isEditing: boolean;
  onToggleEdit: () => void;
  onClose: () => void;
  onChange: (v: FilterValue) => void;
  onRemove: () => void;
}) {
  const chipRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!isEditing) return;
    function handler(e: MouseEvent) {
      if (!chipRef.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isEditing, onClose]);

  const label = chipLabel(col, value);
  const hasValue = filterHasValue(value);

  return (
    <div ref={chipRef} className="relative">
      <div className={`flex items-center gap-1 rounded-full border text-xs transition-colors ${
        hasValue
          ? "bg-indigo-950/60 border-indigo-700 text-indigo-300"
          : "bg-gray-800 border-gray-700 text-gray-400"
      }`}>
        <button onClick={onToggleEdit} className="pl-2.5 pr-1 py-1 flex items-center gap-1">
          <span className="font-medium">{col}</span>
          {hasValue && <span className="text-indigo-400/80">: {label}</span>}
          {!hasValue && <span className="text-gray-600"> ▾</span>}
        </button>
        <button onClick={onRemove} className="pr-2 py-1 text-gray-500 hover:text-gray-200 transition-colors">
          ✕
        </button>
      </div>

      {isEditing && (
        <div className="absolute left-0 top-full mt-1.5 z-40 w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-3">
          <FilterInput col={col} meta={meta} value={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// ── Filter input ───────────────────────────────────────────────────────────────

function FilterInput({
  col, meta, value, onChange,
}: {
  col: string;
  meta: ColumnMeta | undefined;
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}) {
  if (value.type === "text") {
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{col} contains</p>
        <input
          autoFocus
          value={value.q}
          onChange={(e) => onChange({ type: "text", q: e.target.value })}
          placeholder="Search…"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 outline-none focus:border-indigo-500"
        />
      </div>
    );
  }

  if (value.type === "dropdown" && meta?.options) {
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{col}</p>
        <ul className="space-y-1 max-h-40 overflow-y-auto">
          {meta.options.map((opt) => {
            const checked = value.selected.includes(opt);
            return (
              <li key={opt}>
                <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-800 rounded px-1.5 py-1 transition-colors">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? value.selected.filter((s) => s !== opt)
                        : [...value.selected, opt];
                      onChange({ type: "dropdown", selected: next });
                    }}
                    className="accent-indigo-500"
                  />
                  <span className="text-xs text-gray-300 truncate">{opt}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (value.type === "numeric") {
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{col} range</p>
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="number"
            value={value.min}
            onChange={(e) => onChange({ ...value, min: e.target.value })}
            placeholder={meta?.min !== undefined ? String(Math.round(meta.min)) : "Min"}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 outline-none focus:border-indigo-500"
          />
          <span className="text-gray-600 flex-shrink-0">–</span>
          <input
            type="number"
            value={value.max}
            onChange={(e) => onChange({ ...value, max: e.target.value })}
            placeholder={meta?.max !== undefined ? String(Math.round(meta.max)) : "Max"}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 outline-none focus:border-indigo-500"
          />
        </div>
      </div>
    );
  }

  return null;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function chipLabel(col: string, fv: FilterValue): string {
  if (fv.type === "text") return fv.q ? `"${fv.q}"` : "";
  if (fv.type === "dropdown") {
    if (fv.selected.length === 0) return "";
    if (fv.selected.length === 1) return fv.selected[0];
    return `${fv.selected[0]} +${fv.selected.length - 1}`;
  }
  if (fv.type === "numeric") {
    const lo = fv.min !== "" ? fv.min : "−∞";
    const hi = fv.max !== "" ? fv.max : "∞";
    if (fv.min === "" && fv.max === "") return "";
    return `${lo} – ${hi}`;
  }
  return "";
}

function filterHasValue(fv: FilterValue): boolean {
  if (fv.type === "text") return fv.q.trim() !== "";
  if (fv.type === "dropdown") return fv.selected.length > 0;
  if (fv.type === "numeric") return fv.min !== "" || fv.max !== "";
  return false;
}

function PlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
