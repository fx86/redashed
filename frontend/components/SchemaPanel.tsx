"use client";

import { useState, useMemo } from "react";
import type { TableInfo, Annotation } from "@/lib/api";

interface Props {
  tables: TableInfo[];
  annotations?: Annotation[];
  onAnnotate?: (body: { table_schema: string; table_name: string; column_name?: string | null; description: string }) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

export default function SchemaPanel({ tables, annotations = [], onAnnotate, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();

  // Filter tables and columns by search query.
  // A table passes if its name matches OR any of its columns match.
  // When a column matches, auto-expand that table and highlight matching columns.
  const filtered = useMemo(() => {
    if (!query) return tables.map((t) => ({ table: t, matchedCols: null as Set<string> | null }));
    return tables
      .map((t) => {
        const tableMatch = t.name.toLowerCase().includes(query) || t.schema.toLowerCase().includes(query);
        const matchedCols = new Set(
          t.columns.filter((c) => c.name.toLowerCase().includes(query) || c.type.toLowerCase().includes(query)).map((c) => c.name)
        );
        if (tableMatch || matchedCols.size > 0) return { table: t, matchedCols: tableMatch ? null : matchedCols };
        return null;
      })
      .filter(Boolean) as { table: TableInfo; matchedCols: Set<string> | null }[];
  }, [tables, query]);

  async function handleRefresh() {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  }

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function isExpanded(key: string, matchedCols: Set<string> | null) {
    // Auto-expand when search produced column matches
    if (query && matchedCols !== null && matchedCols.size > 0) return true;
    return expanded.has(key);
  }

  function annKey(tableSchema: string, tableName: string, columnName?: string | null) {
    return `${tableSchema}.${tableName}${columnName ? `.${columnName}` : ""}`;
  }

  function getAnnotation(tableSchema: string, tableName: string, columnName?: string | null) {
    return annotations.find(
      (a) =>
        a.table_schema === tableSchema &&
        a.table_name === tableName &&
        (columnName ? a.column_name === columnName : a.column_name == null)
    );
  }

  function startEdit(key: string, current: string) {
    setEditing(key);
    setEditValue(current);
  }

  async function commitEdit(tableSchema: string, tableName: string, columnName?: string | null) {
    if (!onAnnotate) return;
    const trimmed = editValue.trim();
    setEditing(null);
    if (!trimmed) return;
    setSaving(true);
    try {
      await onAnnotate({ table_schema: tableSchema, table_name: tableName, column_name: columnName ?? null, description: trimmed });
    } finally {
      setSaving(false);
    }
  }

  function highlight(text: string) {
    if (!query) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-indigo-500/30 text-indigo-200 rounded-sm">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    );
  }

  return (
    <aside className="bg-gray-900 border border-gray-800 rounded-lg p-2.5 overflow-y-auto max-h-64 md:max-h-[calc(100vh-120px)] flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
          {query ? `${filtered.length} / ${tables.length}` : `${tables.length} table${tables.length !== 1 ? "s" : ""}`}
          {onAnnotate && !query && <span className="ml-1 text-gray-700 normal-case tracking-normal">· hover to annotate</span>}
        </p>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh schema"
            className="text-gray-600 hover:text-gray-300 transition-colors disabled:opacity-40"
          >
            <svg
              width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={refreshing ? "animate-spin" : ""}
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 flex-shrink-0">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 flex-shrink-0">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          className="bg-transparent border-none outline-none text-gray-100 text-xs w-full placeholder:text-gray-600"
          placeholder="Search tables & columns…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setSearch(""); }}
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-gray-600 hover:text-gray-400 flex-shrink-0 leading-none">✕</button>
        )}
      </div>

      {/* Table list */}
      <ul className="space-y-0.5 overflow-y-auto flex-1 min-h-0">
        {filtered.length === 0 && (
          <li className="text-xs text-gray-600 px-1 py-2">No matches for &ldquo;{search}&rdquo;</li>
        )}
        {filtered.map(({ table: t, matchedCols }) => {
          const tableKey = `${t.schema}.${t.name}`;
          const open = isExpanded(tableKey, matchedCols);
          const tableAnn = getAnnotation(t.schema, t.name);
          const tableEditKey = annKey(t.schema, t.name);
          return (
            <li key={tableKey}>
              <div className="group flex items-start gap-1">
                <button
                  onClick={() => toggle(tableKey)}
                  className="flex-1 text-left text-xs py-0.5 px-1.5 rounded hover:bg-gray-800 flex items-center gap-1 min-w-0"
                >
                  <span className="text-gray-600 text-[10px] flex-shrink-0">{open ? "▾" : "▸"}</span>
                  <span className="text-gray-200 truncate">{highlight(t.name)}</span>
                  <span className="text-gray-600 text-[10px] ml-1">{highlight(t.schema)}</span>
                </button>
                {onAnnotate && (
                  <button
                    onClick={() => startEdit(tableEditKey, tableAnn?.description ?? "")}
                    title="Add annotation"
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 mt-1 p-0.5 text-gray-700 hover:text-indigo-400 transition-colors"
                  >
                    <PencilIcon />
                  </button>
                )}
              </div>

              {editing === tableEditKey ? (
                <div className="ml-5 mt-1 mb-1">
                  <input
                    autoFocus
                    className="w-full bg-gray-800 border border-indigo-500 rounded px-2 py-0.5 text-xs text-gray-100 outline-none"
                    placeholder="Describe this table…"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitEdit(t.schema, t.name, null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                </div>
              ) : tableAnn ? (
                <p className="ml-5 mt-0.5 mb-1 text-[11px] text-indigo-400/80 italic leading-tight truncate">{tableAnn.description}</p>
              ) : null}

              {open && (
                <ul className="ml-5 mt-1 space-y-0.5">
                  {t.columns.map((c) => {
                    const colEditKey = annKey(t.schema, t.name, c.name);
                    const colAnn = getAnnotation(t.schema, t.name, c.name);
                    const isColMatch = matchedCols?.has(c.name) ?? false;
                    return (
                      <li key={c.name} className={`group/col ${isColMatch ? "bg-indigo-950/30 rounded" : ""}`}>
                        <div className="flex items-center gap-1 py-0.5 px-1">
                          <span className="text-xs text-gray-300 flex-1 min-w-0 truncate">{highlight(c.name)}</span>
                          <span className="text-xs text-gray-600 flex-shrink-0">{highlight(c.type)}</span>
                          {onAnnotate && (
                            <button
                              onClick={() => startEdit(colEditKey, colAnn?.description ?? "")}
                              title="Add annotation"
                              className="opacity-0 group-hover/col:opacity-100 flex-shrink-0 p-0.5 text-gray-700 hover:text-indigo-400 transition-colors"
                            >
                              <PencilIcon />
                            </button>
                          )}
                        </div>
                        {editing === colEditKey ? (
                          <input
                            autoFocus
                            className="w-full bg-gray-800 border border-indigo-500 rounded px-2 py-0.5 text-xs text-gray-100 outline-none mb-1"
                            placeholder="Describe this column…"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(t.schema, t.name, c.name)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") setEditing(null);
                            }}
                          />
                        ) : colAnn ? (
                          <p className="text-[11px] text-indigo-400/80 italic leading-tight truncate mb-1">{colAnn.description}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {saving && <p className="text-[11px] text-gray-600 flex-shrink-0">Saving…</p>}
    </aside>
  );
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
