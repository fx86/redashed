"use client";

import { useState } from "react";
import type { TableInfo, Annotation } from "@/lib/api";

interface Props {
  tables: TableInfo[];
  annotations?: Annotation[];
  onAnnotate?: (body: { table_schema: string; table_name: string; column_name?: string | null; description: string }) => Promise<void>;
}

export default function SchemaPanel({ tables, annotations = [], onAnnotate }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null); // key of the item being edited
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
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

  return (
    <aside className="bg-gray-900 border border-gray-800 rounded-lg p-2.5 overflow-y-auto max-h-64 md:max-h-[calc(100vh-120px)]">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 font-semibold">
        {tables.length} table{tables.length !== 1 ? "s" : ""}
        {onAnnotate && <span className="ml-1 text-gray-700 normal-case tracking-normal">· hover to annotate</span>}
      </p>
      <ul className="space-y-0.5">
        {tables.map((t) => {
          const tableKey = `${t.schema}.${t.name}`;
          const open = expanded.has(tableKey);
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
                  <span className="text-gray-200 truncate">{t.name}</span>
                  <span className="text-gray-600 text-[10px] ml-1">{t.schema}</span>
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

              {/* Table annotation display / inline edit */}
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
                    return (
                      <li key={c.name} className="group/col">
                        <div className="flex items-center gap-1 py-0.5">
                          <span className="text-xs text-gray-300 flex-1 min-w-0 truncate">{c.name}</span>
                          <span className="text-xs text-gray-600 flex-shrink-0">{c.type}</span>
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
      {saving && <p className="text-[11px] text-gray-600 mt-2">Saving…</p>}
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
