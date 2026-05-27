"use client";

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ColKind = "text" | "dropdown" | "numeric";

export interface ColumnMeta {
  name: string;
  kind: ColKind;
  options?: string[];
  min?: number;
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
    if (values.length > 0 && values.every((v) => !isNaN(Number(v)))) {
      const nums = values.map(Number);
      return { name, kind: "numeric" as const, min: Math.min(...nums), max: Math.max(...nums) };
    }
    const unique = [...new Set(values.map((v) => String(v)))].sort();
    if (unique.length <= 15) return { name, kind: "dropdown" as const, options: unique };
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

// ── Utilities ──────────────────────────────────────────────────────────────────

export function filterHasValue(fv: FilterValue): boolean {
  if (fv.type === "text") return fv.q.trim() !== "";
  if (fv.type === "dropdown") return fv.selected.length > 0;
  if (fv.type === "numeric") return fv.min !== "" || fv.max !== "";
  return false;
}

export function activeFilterCount(filters: FilterState): number {
  return Object.values(filters).filter(filterHasValue).length;
}

// ── Filter toggle button (lives in dashboard header) ──────────────────────────

export function FilterToggleButton({
  activeCount,
  isOpen,
  onClick,
}: {
  activeCount: number;
  isOpen: boolean;
  onClick: () => void;
}) {
  const active = activeCount > 0;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
        active
          ? "bg-indigo-600/20 text-indigo-300 border border-indigo-700/50 hover:bg-indigo-600/30"
          : isOpen
          ? "bg-gray-800 text-gray-200 hover:bg-gray-700"
          : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
      }`}
    >
      <FilterIcon size={11} />
      Filters
      {active && (
        <span className="bg-indigo-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none flex-shrink-0">
          {activeCount}
        </span>
      )}
    </button>
  );
}

// ── Filter panel ───────────────────────────────────────────────────────────────

interface PanelProps {
  columns: ColumnMeta[];
  filters: FilterState;
  onChange: (col: string, value: FilterValue | null) => void;
  onClear: () => void;
}

export function DashboardFilterPanel({ columns, filters, onChange, onClear }: PanelProps) {
  if (columns.length === 0) return null;

  const count = activeFilterCount(filters);

  return (
    <div className="border-b border-gray-800 bg-gray-900/60 backdrop-blur-sm px-4 py-3">
      <div className="max-w-[1080px] mx-auto space-y-3">
        {/* Panel header */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            {count > 0 ? `${count} filter${count !== 1 ? "s" : ""} active` : "Filter columns"}
          </span>
          {count > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Filter cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {columns.map((col) => {
            const value = filters[col.name];
            const active = value !== undefined && filterHasValue(value);
            return (
              <FilterCard
                key={col.name}
                col={col}
                value={value}
                active={active}
                onChange={(v) => onChange(col.name, v)}
                onClear={() => onChange(col.name, null)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Filter card ────────────────────────────────────────────────────────────────

function FilterCard({
  col,
  value,
  active,
  onChange,
  onClear,
}: {
  col: ColumnMeta;
  value: FilterValue | undefined;
  active: boolean;
  onChange: (v: FilterValue) => void;
  onClear: () => void;
}) {
  const effective: FilterValue =
    value ??
    (col.kind === "numeric"
      ? { type: "numeric", min: "", max: "" }
      : col.kind === "dropdown"
      ? { type: "dropdown", selected: [] }
      : { type: "text", q: "" });

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 space-y-2 transition-colors ${
        active
          ? "bg-indigo-950/30 border-indigo-700/50"
          : "bg-gray-800/40 border-gray-700/40"
      }`}
    >
      <div className="flex items-center justify-between min-w-0">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider truncate ${
            active ? "text-indigo-400" : "text-gray-500"
          }`}
        >
          {col.name}
        </span>
        {active && (
          <button
            onClick={onClear}
            className="text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0 ml-1.5"
            aria-label={`Clear ${col.name} filter`}
          >
            <XSmallIcon />
          </button>
        )}
      </div>
      <FilterInput meta={col} value={effective} onChange={onChange} />
    </div>
  );
}

// ── Filter inputs ──────────────────────────────────────────────────────────────

function FilterInput({
  meta,
  value,
  onChange,
}: {
  meta: ColumnMeta;
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}) {
  if (value.type === "text") {
    return <TextFilter value={value} onChange={onChange} />;
  }
  if (value.type === "dropdown" && meta.options) {
    return <DropdownFilter value={value} options={meta.options} onChange={onChange} />;
  }
  if (value.type === "numeric") {
    return <NumericFilter meta={meta} value={value} onChange={onChange} />;
  }
  return null;
}

function TextFilter({
  value,
  onChange,
}: {
  value: Extract<FilterValue, { type: "text" }>;
  onChange: (v: FilterValue) => void;
}) {
  return (
    <input
      value={value.q}
      onChange={(e) => onChange({ type: "text", q: e.target.value })}
      placeholder="Search…"
      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600 outline-none focus:border-indigo-500 transition-colors"
    />
  );
}

function DropdownFilter({
  value,
  options,
  onChange,
}: {
  value: Extract<FilterValue, { type: "dropdown" }>;
  options: string[];
  onChange: (v: FilterValue) => void;
}) {
  const [search, setSearch] = useState("");
  const visible = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className="space-y-1">
      {options.length > 6 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600 outline-none focus:border-indigo-500 transition-colors"
        />
      )}
      <ul className="space-y-0.5 max-h-28 overflow-y-auto">
        {visible.map((opt) => {
          const checked = value.selected.includes(opt);
          return (
            <li key={opt}>
              <label className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-700/40 rounded px-1 py-0.5 transition-colors">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? value.selected.filter((s) => s !== opt)
                      : [...value.selected, opt];
                    onChange({ type: "dropdown", selected: next });
                  }}
                  className="accent-indigo-500 flex-shrink-0"
                />
                <span className="text-xs text-gray-300 truncate">{opt}</span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="text-xs text-gray-600 px-1 py-0.5">No matches</li>
        )}
      </ul>
    </div>
  );
}

function NumericFilter({
  meta,
  value,
  onChange,
}: {
  meta: ColumnMeta;
  value: Extract<FilterValue, { type: "numeric" }>;
  onChange: (v: FilterValue) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={value.min}
        onChange={(e) => onChange({ ...value, min: e.target.value })}
        placeholder={meta.min !== undefined ? String(Math.round(meta.min)) : "Min"}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600 outline-none focus:border-indigo-500 transition-colors"
      />
      <span className="text-gray-600 flex-shrink-0 text-xs">–</span>
      <input
        type="number"
        value={value.max}
        onChange={(e) => onChange({ ...value, max: e.target.value })}
        placeholder={meta.max !== undefined ? String(Math.round(meta.max)) : "Max"}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600 outline-none focus:border-indigo-500 transition-colors"
      />
    </div>
  );
}

// ── Tile filter indicator (shown in tile header when filters are active) ────────

export function TileFilterDot({
  filters,
  columns,
}: {
  filters: FilterState;
  columns: string[];
}) {
  // Only surface filters that actually apply to this tile's columns
  const relevant = Object.entries(filters).filter(
    ([col, fv]) => columns.includes(col) && filterHasValue(fv)
  );
  if (relevant.length === 0) return null;

  const tooltip = `Filtered by: ${relevant.map(([col]) => col).join(" · ")}`;

  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-0.5 text-[10px] text-indigo-400 bg-indigo-950/50 border border-indigo-800/60 rounded px-1.5 py-0.5 flex-shrink-0 leading-none"
    >
      <FilterIcon size={8} />
      {relevant.length}
    </span>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function FilterIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function XSmallIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
