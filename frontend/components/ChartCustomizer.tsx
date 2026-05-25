"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type React from "react";
import { useThemeRegistry } from "@bi-tool/charts";
import type { ChartConfig, ThemeSpec } from "@bi-tool/charts";
import { THEME_LABELS } from "@bi-tool/charts";

interface Props {
  config: ChartConfig;
  columns: string[];
  onChange: (updates: Partial<ChartConfig>) => void;
}

// Human-readable labels per config field
const FIELD_LABELS: Record<string, string> = {
  x: "X axis",
  y: "Y axis",
  fill: "Colour column",
  value: "Value",
  delta: "Compare to",
};

// Which config fields are meaningful per chart type
const CHART_COLUMNS: Record<string, string[]> = {
  bar:       ["x", "y"],
  line:      ["x", "y"],
  area:      ["x", "y"],
  scatter:   ["x", "y"],
  histogram: ["x"],
  heatmap:   ["x", "y", "fill"],
  donut:     ["x", "y"],
  kpi:       ["value", "delta"],
  pivot:     [], // pivot has its own inline controls
  table:     [],
};

// Charts where highlight mode has a visible effect
const HIGHLIGHT_CHARTS = new Set(["bar", "line", "area", "scatter"]);

// ── Mini bar preview shown inside each theme card ───────────────────────────
function MiniBarPreview({ theme }: { theme: ThemeSpec }) {
  const bg = theme.background === "transparent" ? "#0a0f1a" : theme.background;
  const uniform = theme.highlightMode === "uniform";
  const bars = [
    { h: "50%",  fill: uniform ? theme.ink : theme.muted },
    { h: "100%", fill: uniform ? theme.ink : theme.accent },
    { h: "38%",  fill: uniform ? theme.ink : theme.muted },
    { h: "68%",  fill: uniform ? theme.ink : theme.muted },
    { h: "83%",  fill: uniform ? theme.ink : theme.muted },
  ];
  return (
    <div className="w-full h-7 flex items-end gap-px px-1.5 pt-1.5 rounded-t" style={{ background: bg }}>
      {bars.map((b, i) => (
        <div key={i} className="flex-1 rounded-t-sm" style={{ height: b.h, background: b.fill }} />
      ))}
    </div>
  );
}

// ── Section label within the popover ────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-gray-600 uppercase tracking-wider font-medium mb-2">
      {children}
    </p>
  );
}

// ── Gear icon ────────────────────────────────────────────────────────────────
function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ChartCustomizer({ config, columns, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const themeRegistry = useThemeRegistry();
  const themes = themeRegistry.all();

  const chartType = config.type;
  const activeTheme = config.themeName ?? "tufte-dark";
  const activeHighlight = config.highlightMode ?? "max";
  const fields = CHART_COLUMNS[chartType] ?? (config.x !== undefined ? ["x", "y"] : []);
  const showHighlight = HIGHLIGHT_CHARTS.has(chartType);

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const POPOVER_W = 288; // w-72
      const POPOVER_MAX_H = Math.min(520, window.innerHeight - 80);
      const rawRight = window.innerWidth - rect.right;
      const right = Math.min(
        Math.max(8, rawRight),
        Math.max(8, window.innerWidth - POPOVER_W - 8),
      );
      // Flip above button if not enough space below
      const spaceBelow = window.innerHeight - rect.bottom - 4;
      const top =
        spaceBelow >= POPOVER_MAX_H
          ? rect.bottom + 4
          : Math.max(8, rect.top - POPOVER_MAX_H - 4);
      setPos({ top, right });
    }
    setOpen((v) => !v);
  }

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !btnRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Gear trigger */}
      <button
        ref={btnRef}
        onClick={toggle}
        className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
          open
            ? "text-indigo-400 bg-indigo-950/40"
            : "text-gray-600 hover:text-gray-400 hover:bg-gray-800"
        }`}
        title="Chart settings"
        aria-label="Chart settings"
        aria-expanded={open}
      >
        <GearIcon />
      </button>

      {/* Fixed popover — portalled to body to escape CSS transform stacking context */}
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[200] w-72 max-w-[calc(100vw-16px)] bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-y-auto"
          style={{
            top: pos.top,
            right: pos.right,
            maxHeight: "min(520px, calc(100vh - 80px))",
          }}
        >
          {/* ── Theme ──────────────────────────────────────────────────────── */}
          <div className="p-3">
            <SectionLabel>Theme</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {themes.map(({ key, theme }) => (
                <button
                  key={key}
                  onClick={() => onChange({ themeName: key })}
                  className={`rounded-lg border overflow-hidden text-left transition-all ${
                    activeTheme === key
                      ? "border-indigo-500 ring-1 ring-indigo-500/40"
                      : "border-gray-800 hover:border-gray-600"
                  }`}
                >
                  <MiniBarPreview theme={theme} />
                  <div
                    className="px-2 py-1"
                    style={{
                      background:
                        theme.background === "transparent" ? "#0a0f1a" : theme.background,
                    }}
                  >
                    <p
                      className="text-[10px] font-medium truncate"
                      style={{ color: theme.axis }}
                    >
                      {THEME_LABELS[key] ?? key}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Highlight mode ─────────────────────────────────────────────── */}
          {showHighlight && (
            <>
              <div className="h-px bg-gray-800" />
              <div className="p-3">
                <SectionLabel>Highlight</SectionLabel>
                <div className="flex gap-1">
                  {(["max", "uniform", "none"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => onChange({ highlightMode: mode })}
                      className={`flex-1 py-1.5 rounded text-xs transition-colors ${
                        activeHighlight === mode
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                      }`}
                    >
                      {mode === "max" ? "Peak" : mode === "uniform" ? "Flat" : "None"}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-700 mt-1.5 leading-relaxed">
                  {activeHighlight === "max"
                    ? "Accents the highest value, mutes the rest."
                    : activeHighlight === "uniform"
                    ? "All marks rendered in the same colour."
                    : "All marks subdued — reference-only view."}
                </p>
              </div>
            </>
          )}

          {/* ── Column selectors ───────────────────────────────────────────── */}
          {fields.length > 0 && columns.length > 0 && (
            <>
              <div className="h-px bg-gray-800" />
              <div className="p-3">
                <SectionLabel>Columns</SectionLabel>
                <div className="space-y-2">
                  {fields.map((field) => {
                    const value = (config[field] as string | undefined) ?? "";
                    return (
                      <div key={field}>
                        <label className="block text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">
                          {FIELD_LABELS[field] ?? field}
                        </label>
                        <select
                          value={value}
                          onChange={(e) =>
                            onChange({ [field]: e.target.value } as Partial<ChartConfig>)
                          }
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
                        >
                          {/* delta is optional — allow clearing it */}
                          {field === "delta" && <option value="">— none —</option>}
                          {columns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
