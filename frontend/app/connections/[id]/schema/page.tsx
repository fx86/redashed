"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import Nav from "@/components/Nav";
import {
  listUserConnections,
  getConnectionSchema,
  listAnnotations,
  upsertAnnotation,
  deleteAnnotation,
} from "@/lib/api";
import type { SavedConnection, TableInfo, Annotation } from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────────

function annKey(tableSchema: string, tableName: string, col?: string | null) {
  return `${tableSchema}.${tableName}${col ? `.${col}` : ""}`;
}

function getAnn(annotations: Annotation[], tableSchema: string, tableName: string, col?: string | null) {
  return annotations.find(
    (a) =>
      a.table_schema === tableSchema &&
      a.table_name === tableName &&
      (col ? a.column_name === col : a.column_name == null)
  );
}

function tableProgress(table: TableInfo, annotations: Annotation[]) {
  const annotated = table.columns.filter((c) => getAnn(annotations, table.schema, table.name, c.name)).length;
  return { annotated, total: table.columns.length };
}

function overallProgress(tables: TableInfo[], annotations: Annotation[]) {
  let annotated = 0, total = 0;
  for (const t of tables) {
    const p = tableProgress(t, annotations);
    annotated += p.annotated;
    total += p.total;
  }
  return { annotated, total };
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SchemaAnnotationPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const jwt = session?.access_token ?? "";

  const [conn, setConn] = useState<SavedConnection | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!jwt || !id) return;
    Promise.all([
      listUserConnections(jwt),
      getConnectionSchema(jwt, id),
      listAnnotations(jwt, id),
    ])
      .then(([conns, schema, anns]) => {
        setConn(conns.find((c) => c.id === id) ?? null);
        setTables(schema);
        setAnnotations(anns);
        // Expand all tables by default
        setExpanded(new Set(schema.map((t) => `${t.schema}.${t.name}`)));
      })
      .catch((e) => setError(e.message ?? "Failed to load schema"))
      .finally(() => setLoading(false));
  }, [jwt, id]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  async function handleAnnotate(body: {
    table_schema: string;
    table_name: string;
    column_name?: string | null;
    description: string;
  }) {
    const ann = await upsertAnnotation(jwt, id, body);
    setAnnotations((prev) => {
      const filtered = prev.filter(
        (a) =>
          !(
            a.table_schema === body.table_schema &&
            a.table_name === body.table_name &&
            (body.column_name ? a.column_name === body.column_name : a.column_name == null)
          )
      );
      return [...filtered, ann];
    });
    showToast("Saved");
  }

  async function handleDelete(ann: Annotation) {
    await deleteAnnotation(jwt, id, ann.id);
    setAnnotations((prev) => prev.filter((a) => a.id !== ann.id));
  }

  async function handleReIntrospect() {
    setReloading(true);
    try {
      const schema = await getConnectionSchema(jwt, id);
      setTables(schema);
      setExpanded(new Set(schema.map((t) => `${t.schema}.${t.name}`)));
      showToast("Schema refreshed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-introspect failed");
    } finally {
      setReloading(false);
    }
  }

  function toggleTable(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const overall = overallProgress(tables, annotations);
  const pct = overall.total > 0 ? Math.round((overall.annotated / overall.total) * 100) : 0;

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex flex-col">
        <Nav />
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Loading schema…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Nav />

      <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/connections" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                ← Connections
              </a>
            </div>
            <h1 className="text-base font-semibold text-gray-100">
              {conn?.name ?? "Schema"} — annotation
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Add descriptions to tables and columns. These are injected into AI prompts to improve SQL quality.
            </p>
          </div>
          <button
            onClick={handleReIntrospect}
            disabled={reloading}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 transition-colors flex-shrink-0"
          >
            {reloading ? "Refreshing…" : "↻ Re-introspect"}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded px-3 py-2">{error}</p>
        )}

        {/* Overall progress */}
        {overall.total > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Column coverage</span>
              <span className={pct === 100 ? "text-emerald-400" : "text-gray-400"}>
                {overall.annotated} / {overall.total} columns annotated ({pct}%)
              </span>
            </div>
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Tables */}
        {tables.length === 0 ? (
          <p className="text-sm text-gray-500">No tables found in this connection.</p>
        ) : (
          <div className="space-y-3">
            {tables.map((t) => {
              const tableKey = `${t.schema}.${t.name}`;
              const isOpen = expanded.has(tableKey);
              const tableAnn = getAnn(annotations, t.schema, t.name);
              const prog = tableProgress(t, annotations);

              return (
                <TableCard
                  key={tableKey}
                  table={t}
                  tableAnnotation={tableAnn}
                  annotations={annotations}
                  isOpen={isOpen}
                  progress={prog}
                  onToggle={() => toggleTable(tableKey)}
                  onAnnotate={handleAnnotate}
                  onDelete={handleDelete}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Toast */}
      <div
        className={`fixed bottom-4 right-4 z-50 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 shadow-xl transition-all duration-200 ${
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        }`}
      >
        {toast}
      </div>
    </main>
  );
}

// ── Table card ─────────────────────────────────────────────────────────────────

function TableCard({
  table,
  tableAnnotation,
  annotations,
  isOpen,
  progress,
  onToggle,
  onAnnotate,
  onDelete,
}: {
  table: TableInfo;
  tableAnnotation: Annotation | undefined;
  annotations: Annotation[];
  isOpen: boolean;
  progress: { annotated: number; total: number };
  onToggle: () => void;
  onAnnotate: (body: { table_schema: string; table_name: string; column_name?: string | null; description: string }) => Promise<void>;
  onDelete: (ann: Annotation) => Promise<void>;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Table header */}
      <div className="px-4 py-3 flex items-start gap-3">
        <button
          onClick={onToggle}
          className="flex-shrink-0 mt-0.5 text-gray-600 hover:text-gray-300 transition-colors"
          aria-label={isOpen ? "Collapse" : "Expand"}
        >
          <span className="text-[10px]">{isOpen ? "▾" : "▸"}</span>
        </button>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-100">{table.name}</span>
            <span className="text-[10px] text-gray-600 bg-gray-800 border border-gray-700 rounded px-1 leading-4">{table.schema}</span>
            <ProgressPip annotated={progress.annotated} total={progress.total} />
          </div>

          <InlineEdit
            value={tableAnnotation?.description ?? ""}
            placeholder="Describe this table…"
            onSave={async (desc) => {
              if (desc) {
                await onAnnotate({ table_schema: table.schema, table_name: table.name, column_name: null, description: desc });
              } else if (tableAnnotation) {
                await onDelete(tableAnnotation);
              }
            }}
          />
        </div>
      </div>

      {/* Columns */}
      {isOpen && (
        <div className="border-t border-gray-800 divide-y divide-gray-800/60">
          {table.columns.map((col) => {
            const colAnn = getAnn(annotations, table.schema, table.name, col.name);
            return (
              <div key={col.name} className="px-4 py-2.5 flex items-start gap-3">
                <AnnotationDot hasAnnotation={!!colAnn} />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-200">{col.name}</span>
                    <span className="text-[10px] text-gray-600 font-mono">{col.type}</span>
                  </div>
                  <InlineEdit
                    value={colAnn?.description ?? ""}
                    placeholder="Add description…"
                    onSave={async (desc) => {
                      if (desc) {
                        await onAnnotate({ table_schema: table.schema, table_name: table.name, column_name: col.name, description: desc });
                      } else if (colAnn) {
                        await onDelete(colAnn);
                      }
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Inline edit ────────────────────────────────────────────────────────────────

function InlineEdit({
  value,
  placeholder,
  onSave,
}: {
  value: string;
  placeholder: string;
  onSave: (val: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes (e.g. after save)
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function startEdit() {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function commit() {
    const trimmed = draft.trim();
    if (trimmed === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-indigo-500 rounded px-2 py-1 text-xs text-gray-100 outline-none placeholder:text-gray-600"
        disabled={saving}
      />
    );
  }

  if (value) {
    return (
      <button
        onClick={startEdit}
        className="text-left text-xs text-indigo-400/80 italic hover:text-indigo-300 transition-colors"
        title="Click to edit"
      >
        {value}
      </button>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="text-left text-xs text-gray-700 hover:text-gray-500 transition-colors"
      title="Add description"
    >
      {placeholder}
    </button>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AnnotationDot({ hasAnnotation }: { hasAnnotation: boolean }) {
  return (
    <span
      className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasAnnotation ? "bg-emerald-500" : "bg-gray-700"}`}
      title={hasAnnotation ? "Annotated" : "No description"}
    />
  );
}

function ProgressPip({ annotated, total }: { annotated: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.round((annotated / total) * 100);
  const color = pct === 100 ? "text-emerald-400" : annotated > 0 ? "text-indigo-400" : "text-gray-600";
  return (
    <span className={`text-[10px] ${color}`}>
      {annotated}/{total}
    </span>
  );
}
