"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";
import {
  listUserConnections,
  createUserConnection,
  getConnectionSchema,
  runSavedConnectionQuery,
  runSql,
  saveQuery,
  updateSavedQuery,
  getSavedQuery,
  listAnnotations,
  upsertAnnotation,
  listUploads,
  deleteUpload,
} from "@/lib/api";
import type { SavedConnection, TableInfo, QueryResponse, Annotation, Upload } from "@/lib/api";
import { selectChartType, useRegistry } from "@bi-tool/charts";
import type { ChartType, ChartConfig } from "@bi-tool/charts";
import Nav from "@/components/Nav";
import { downloadCSV, downloadChartImage, slugFilename } from "@/lib/export";
import { useVoiceInput } from "@/lib/useVoiceInput";
import SavedConnectionForm from "@/components/SavedConnectionForm";
import FileUpload from "@/components/FileUpload";
import SchemaPanel from "@/components/SchemaPanel";
import QueryInput from "@/components/QueryInput";
import ResultsTable from "@/components/ResultsTable";
import ChartView from "@/components/ChartView";
import SaveToDashboard from "@/components/SaveToDashboard";
import ChartCustomizer from "@/components/ChartCustomizer";

type AppStep = "connections" | "query";
type QueryMode = "ai" | "sql" | "chain";
type JoinType = "INNER" | "LEFT" | "RIGHT";

const DRAFT_KEY = "bi-tool-sql-draft";

function saveDraft(connectionId: string, sql: string, question: string) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ connectionId, sql, question })); } catch {}
}
function loadDraft(connectionId: string): { sql: string; question: string } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d.connectionId === connectionId ? d : null;
  } catch { return null; }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

export default function Home() {
  const { user, session, loading: authLoading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<AppStep>("connections");
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [activeConnection, setActiveConnection] = useState<SavedConnection | null>(null);
  const [schema, setSchema] = useState<TableInfo[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("table");
  const [chartConfig, setChartConfig] = useState<ChartConfig>({ type: "table" });
  const [showSaveToDashboard, setShowSaveToDashboard] = useState(false);
  const [queryMode, setQueryMode] = useState<QueryMode>("ai");
  const [sqlInput, setSqlInput] = useState("");
  const [currentQueryId, setCurrentQueryId] = useState<string | null>(null);
  const [extraViews, setExtraViews] = useState<{ id: string; chartType: ChartType; config: ChartConfig }[]>([]);

  // Chain mode state
  const [sqlA, setSqlA] = useState("");
  const [sqlB, setSqlB] = useState("");
  const [resultA, setResultA] = useState<QueryResponse | null>(null);
  const [resultB, setResultB] = useState<QueryResponse | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [joinKey, setJoinKey] = useState("");
  const [joinType, setJoinType] = useState<JoinType>("INNER");
  const [chainError, setChainError] = useState<string | null>(null);

  const registry = useRegistry();
  const jwt = session?.access_token ?? "";
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const extraChartRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const sqlVoice = useVoiceInput((t) =>
    setSqlInput((prev) => (prev.trim() ? `${prev}\n${t}` : t))
  );

  // Cmd+S saves the current query from anywhere on the page
  const handleSaveQueryRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && step === "query" && result && !saved) {
        e.preventDefault();
        handleSaveQueryRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, result, saved]);

  // Save draft whenever SQL changes; reset saved state so button re-enables
  useEffect(() => {
    if (activeConnection && sqlInput) {
      saveDraft(activeConnection.id, sqlInput, lastQuestion);
      setIsDirty(true);
      setSaved(false);
    }
  }, [sqlInput, activeConnection, lastQuestion]);

  useEffect(() => {
    if (!jwt) {
      setInitializing(false);
      return;
    }

    // Read URL params before loading connections
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const queryId = params?.get("query_id") ?? null;
    const connectionId = params?.get("connection_id") ?? null;

    Promise.all([listUserConnections(jwt), listUploads(jwt).catch(() => [])])
      .then(async ([allConns, existingUploads]) => {
        setUploads(existingUploads);
        // flat_file connections are excluded from the picker cards but must
        // remain resolvable for deep links / saved queries against uploads.
        const conns = allConns.filter((c) => c.db_type !== "flat_file");
        setConnections(conns);
        if (conns.length === 0 && !queryId && !connectionId) {
          const done = typeof window !== "undefined" && localStorage.getItem("onboarding_done");
          if (!done) { router.replace("/onboarding"); return; }
          return;
        }

        if (queryId) {
          try {
            const q = await getSavedQuery(jwt, queryId);
            const conn = allConns.find((c) => c.id === q.connection_id) ?? conns[0];
            const [tables, anns] = await Promise.all([
              getConnectionSchema(jwt, conn.id),
              listAnnotations(jwt, conn.id).catch(() => []),
            ]);
            setActiveConnection(conn);
            setSchema(tables);
            setAnnotations(anns);
            setSqlInput(q.sql);
            setLastQuestion(q.question);
            setQueryMode("sql");
            setStep("query");
            window.history.replaceState({}, "", "/");
            // Auto-run the saved query so results appear immediately
            try {
              const res = await runSql(jwt, conn.id, q.sql);
              applyResult(res, q.question);
              setCurrentQueryId(q.id);
              // Restore saved chart config if it exists (overrides auto-selection)
              if (q.chart_config && q.chart_type && q.chart_type !== "table") {
                const savedCfg = { ...q.chart_config, type: q.chart_type } as import("@bi-tool/charts").ChartConfig;
                setChartConfig(savedCfg);
                setChartType(q.chart_type as import("@bi-tool/charts").ChartType);
              }
            } catch { /* SQL loaded, user can run manually */ }
          } catch {
            await connectFirst(conns, jwt);
          }
        } else if (connectionId) {
          const conn = allConns.find((c) => c.id === connectionId);
          window.history.replaceState({}, "", "/");
          if (conn) {
            try {
              const tables = await getConnectionSchema(jwt, conn.id);
              const anns = await listAnnotations(jwt, conn.id).catch(() => []);
              const draft = loadDraft(conn.id);
              if (draft) { setSqlInput(draft.sql); setLastQuestion(draft.question); setQueryMode("sql"); setIsDirty(true); }
              setActiveConnection(conn);
              setSchema(tables);
              setAnnotations(anns);
              setStep("query");
            } catch { await connectFirst(conns, jwt); }
          } else {
            await connectFirst(conns, jwt);
          }
        } else {
          // Only auto-connect when there's exactly one connection — no ambiguity.
          // With multiple connections, stay on the connections screen so the user
          // can pick which dataset they want to query.
          if (conns.length === 1) {
            await connectFirst(conns, jwt);
          }
          // else: step stays "connections", user selects manually
        }
      })
      .catch(() => {})
      .finally(() => setInitializing(false));
  }, [jwt]); // eslint-disable-line react-hooks/exhaustive-deps

  async function connectFirst(conns: SavedConnection[], token: string) {
    try {
      const tables = await getConnectionSchema(token, conns[0].id);
      const anns = await listAnnotations(token, conns[0].id).catch(() => []);
      // Restore draft if one exists for this connection
      const draft = loadDraft(conns[0].id);
      if (draft) {
        setSqlInput(draft.sql);
        setLastQuestion(draft.question);
        setQueryMode("sql");
        setIsDirty(true);
      }
      setActiveConnection(conns[0]);
      setSchema(tables);
      setAnnotations(anns);
      setStep("query");
    } catch {
      // stay on connections page
    }
  }

  async function handleSelectConnection(conn: SavedConnection) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const tables = await getConnectionSchema(jwt, conn.id);
      const anns = await listAnnotations(jwt, conn.id).catch(() => []);
      const draft = loadDraft(conn.id);
      if (draft) {
        setSqlInput(draft.sql);
        setLastQuestion(draft.question);
        setQueryMode("sql");
        setIsDirty(true);
      }
      setActiveConnection(conn);
      setSchema(tables);
      setAnnotations(anns);
      setStep("query");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schema");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddConnection(body: {
    name: string;
    db_type?: string;
    host: string;
    port: number;
    database: string;
    db_user: string;
    password: string;
    extra_config?: Record<string, unknown>;
  }) {
    setLoading(true);
    setError(null);
    try {
      const conn = await createUserConnection(jwt, body);
      setConnections((prev) => [...prev, conn]);
      setShowAddForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add connection");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(question: string) {
    if (!activeConnection) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    setCurrentQueryId(null);
    setLastQuestion(question);
    try {
      const res = await runSavedConnectionQuery(jwt, activeConnection.id, question);
      applyResult(res, question);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRunSql() {
    if (!activeConnection || !sqlInput.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    // Do NOT clear currentQueryId here — if the user loaded an existing saved query
    // and edits + re-runs it, saving should update that record (not create a new one).
    // currentQueryId is only cleared when starting a genuinely new question (handleQuery).
    setLastQuestion(sqlInput);
    // Capture current chart config before applyResult overwrites it with auto-selection.
    // On a re-run (result already exists), we restore it so the user's chart type choice
    // (e.g. line chart) survives editing and re-running the SQL.
    const isRerun = result !== null;
    const prevChartType = chartType;
    const prevChartConfig = chartConfig;
    try {
      const res = await runSql(jwt, activeConnection.id, sqlInput);
      applyResult(res, sqlInput);
      if (isRerun) {
        setChartType(prevChartType);
        setChartConfig(prevChartConfig);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }

  function applyResult(res: QueryResponse, question: string) {
    setResult(res);
    setLastQuestion(question);
    setExtraViews([]);
    const rows = res.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      res.columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
    const config = selectChartType(res.columns, rows, registry);
    setChartConfig(config);
    setChartType(config.type);
  }

  async function handleSaveQuery() {
    if (!result || !activeConnection) return;
    const body = {
      connection_id: activeConnection.id,
      question: lastQuestion,
      sql: result.sql,
      chart_type: chartType,
      chart_config: chartConfig as Record<string, unknown>,
    };
    try {
      const saved = currentQueryId
        ? await updateSavedQuery(jwt, currentQueryId, body)
        : await saveQuery(jwt, body);
      setCurrentQueryId(saved.id);
      setSaved(true);
      setIsDirty(false);
      clearDraft();
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save query");
    }
  }
  handleSaveQueryRef.current = handleSaveQuery;

  async function handleUploadSuccess(upload: Upload) {
    if (!upload.connection_id) return;
    setShowUploadPanel(false);
    setUploads((prev) => [upload, ...prev.filter((u) => u.id !== upload.id)]);
    const flatFileConn: SavedConnection = {
      id: upload.connection_id,
      name: "Uploaded Files",
      db_type: "flat_file",
      host: "",
      port: 0,
      database: "",
      db_user: "",
      created_at: new Date().toISOString(),
    };
    await handleSelectConnection(flatFileConn);
  }

  async function handleDeleteUpload(uploadId: string, filename: string) {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    await deleteUpload(jwt, uploadId);
    setUploads((prev) => prev.filter((u) => u.id !== uploadId));
  }

  function handleOpenUpload(upload: Upload) {
    if (!upload.connection_id) return;
    const flatFileConn: SavedConnection = {
      id: upload.connection_id,
      name: "Uploaded Files",
      db_type: "flat_file",
      host: "",
      port: 0,
      database: "",
      db_user: "",
      created_at: new Date().toISOString(),
    };
    handleSelectConnection(flatFileConn);
  }

  async function handleAnnotate(body: { table_schema: string; table_name: string; column_name?: string | null; description: string }) {
    if (!activeConnection) return;
    const ann = await upsertAnnotation(jwt, activeConnection.id, body);
    setAnnotations((prev) => {
      const filtered = prev.filter(
        (a) =>
          !(a.table_schema === body.table_schema &&
            a.table_name === body.table_name &&
            (body.column_name ? a.column_name === body.column_name : a.column_name == null))
      );
      return [...filtered, ann];
    });
  }

  async function handleRunChainA() {
    if (!activeConnection || !sqlA.trim()) return;
    setLoadingA(true);
    setChainError(null);
    try {
      const res = await runSql(jwt, activeConnection.id, sqlA);
      setResultA(res);
      // Auto-suggest join key from common columns
      if (resultB) {
        const common = res.columns.filter((c) => resultB.columns.includes(c));
        if (common.length > 0 && !joinKey) setJoinKey(common[0]);
      }
    } catch (e) {
      setChainError(`Query A: ${e instanceof Error ? e.message : "failed"}`);
    } finally {
      setLoadingA(false);
    }
  }

  async function handleRunChainB() {
    if (!activeConnection || !sqlB.trim()) return;
    setLoadingB(true);
    setChainError(null);
    try {
      const res = await runSql(jwt, activeConnection.id, sqlB);
      setResultB(res);
      // Auto-suggest join key from common columns
      if (resultA) {
        const common = resultA.columns.filter((c) => res.columns.includes(c));
        if (common.length > 0 && !joinKey) setJoinKey(common[0]);
      }
    } catch (e) {
      setChainError(`Query B: ${e instanceof Error ? e.message : "failed"}`);
    } finally {
      setLoadingB(false);
    }
  }

  function buildMergeQuery() {
    if (!sqlA.trim()) { setChainError("Query A is empty."); return; }
    if (!sqlB.trim()) { setChainError("Query B is empty."); return; }
    if (!joinKey.trim()) { setChainError("Join key is required."); return; }
    setChainError(null);

    // Build SELECT clause — if both ran, alias conflicting non-key columns
    let selectClause = "*";
    if (resultA && resultB) {
      const conflicts = resultB.columns.filter(
        (c) => c !== joinKey && resultA.columns.includes(c)
      );
      if (conflicts.length > 0) {
        const bCols = resultB.columns
          .filter((c) => c !== joinKey)
          .map((c) => conflicts.includes(c) ? `query_b.${c} AS ${c}_b` : `query_b.${c}`)
          .join(", ");
        selectClause = `query_a.*, ${bCols}`;
      }
    }

    const indent = (sql: string) =>
      sql.trim().split("\n").map((l) => `  ${l}`).join("\n");

    const generated = [
      `WITH query_a AS (`,
      indent(sqlA),
      `),`,
      `query_b AS (`,
      indent(sqlB),
      `)`,
      `SELECT ${selectClause}`,
      `FROM query_a`,
      `${joinType} JOIN query_b ON query_a.${joinKey} = query_b.${joinKey}`,
    ].join("\n");

    setSqlInput(generated);
    setQueryMode("sql");
  }

  function toRows(res: QueryResponse) {
    return res.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      res.columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  function addExtraView() {
    if (!result) return;
    const usedTypes = new Set([chartType, ...extraViews.map((v) => v.chartType)]);
    const next = registry.all().find((d) => !usedTypes.has(d.type));
    if (!next) return;
    const derived = next.deriveConfig(result.columns, toRows(result));
    setExtraViews((prev) => [...prev, {
      id: Math.random().toString(36).slice(2),
      chartType: next.type,
      config: { ...derived, type: next.type } as ChartConfig,
    }]);
  }

  function removeExtraView(id: string) {
    setExtraViews((prev) => prev.filter((v) => v.id !== id));
  }

  function updateExtraViewType(id: string, newType: ChartType) {
    if (!result) return;
    setExtraViews((prev) => prev.map((v) => {
      if (v.id !== id) return v;
      const def = registry.get(newType);
      if (!def) return { ...v, chartType: newType, config: { type: newType } as ChartConfig };
      const derived = def.deriveConfig(result.columns, toRows(result));
      return { ...v, chartType: newType, config: { ...derived, type: newType } as ChartConfig };
    }));
  }

  function goToConnections() {
    setStep("connections");
    setResult(null);
    setError(null);
    setSaved(false);
    setActiveConnection(null);
    setChartType("table");
    setChartConfig({ type: "table" });
    setShowSaveToDashboard(false);
    setIsDirty(false);
    setCurrentQueryId(null);
    setExtraViews([]);
    setSqlA(""); setSqlB(""); setResultA(null); setResultB(null);
    setJoinKey(""); setJoinType("INNER"); setChainError(null);
  }

  if (authLoading || initializing) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading…</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-4"
        style={{
          backgroundColor: "#030712",
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      >
        <AuthForm />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Nav />

      <div className="flex-1">
        <div className="max-w-[1080px] mx-auto px-4 py-3 md:py-4 space-y-4">
          {error && (
            <div className="flex items-start justify-between gap-2 text-sm text-red-400 bg-red-950/40 border border-red-800 rounded p-3">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="flex-shrink-0 text-red-600 hover:text-red-400 leading-none mt-0.5">✕</button>
            </div>
          )}

          {step === "connections" && (
            <div className="space-y-4">
              {/* Uploaded files */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-gray-200">Uploaded files</h2>
                  {showUploadPanel && (
                    <button onClick={() => setShowUploadPanel(false)} className="text-xs text-gray-600 hover:text-gray-400">✕</button>
                  )}
                </div>

                {/* Existing uploads */}
                {uploads.length > 0 && !showUploadPanel && (
                  <div className="space-y-1.5 mb-2">
                    {uploads.map((u) => (
                      <div
                        key={u.id}
                        className="group flex items-center justify-between bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg px-3 py-2.5 cursor-pointer transition-colors"
                        onClick={() => handleOpenUpload(u)}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-200 truncate">{u.original_filename}</p>
                          <p className="text-xs text-gray-500">{u.row_count.toLocaleString()} rows · {u.col_count} cols</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span className="text-xs text-gray-600 hidden group-hover:inline">Query →</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteUpload(u.id, u.original_filename); }}
                            className="text-gray-700 hover:text-red-400 transition-colors px-1 text-xs"
                            title="Delete"
                          >✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload new file */}
                {showUploadPanel ? (
                  <FileUpload jwt={jwt} onUpload={handleUploadSuccess} />
                ) : (
                  <button
                    onClick={() => { setShowUploadPanel(true); setShowAddForm(false); setError(null); }}
                    className="w-full flex items-center gap-3 border border-dashed border-gray-700 hover:border-indigo-600 hover:bg-indigo-950/20 rounded-lg px-4 py-3.5 text-left transition-colors group"
                  >
                    <UploadIcon />
                    <div>
                      <p className="text-sm text-gray-300 group-hover:text-gray-100 transition-colors">Drop a CSV, TSV, or delimited file</p>
                      <p className="text-xs text-gray-600">Comma, tab, pipe, semicolon, or custom separator · queryable immediately</p>
                    </div>
                  </button>
                )}
              </div>

              {/* Warehouse connections */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-gray-200">Warehouse connections</h2>
                  <button
                    onClick={() => { setShowAddForm(true); setShowUploadPanel(false); setError(null); }}
                    className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 transition-colors"
                  >
                    + Add
                  </button>
                </div>

                {showAddForm && (
                  <SavedConnectionForm
                    onSave={handleAddConnection}
                    onCancel={() => { setShowAddForm(false); setError(null); }}
                    loading={loading}
                    jwt={jwt}
                    onDataGovImport={(conn) => {
                      setConnections((prev) => [...prev, conn]);
                      setShowAddForm(false);
                      handleSelectConnection(conn);
                    }}
                  />
                )}

                {connections.length === 0 && !showAddForm && (
                  <p className="text-sm text-gray-500">No warehouse connections yet.</p>
                )}

                <div className="space-y-1.5">
                  {connections.map((conn) => (
                    <div
                      key={conn.id}
                      className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium">{conn.name}</p>
                          <span className="text-[10px] text-gray-600 bg-gray-800 border border-gray-700 rounded px-1 leading-4">
                            {conn.db_type === "postgres" ? "PG" : conn.db_type === "snowflake" ? "SF" : (conn.db_type ?? "DB").slice(0, 3).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {conn.host}:{conn.port} / {conn.database}
                        </p>
                      </div>
                      <button
                        onClick={() => handleSelectConnection(conn)}
                        disabled={loading}
                        className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 transition-colors"
                      >
                        {loading ? "Connecting…" : "Connect"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "query" && activeConnection && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={goToConnections}
                  className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-xs transition-colors"
                >
                  <span>←</span>
                  <span className="text-gray-600 hover:text-gray-400">Connections</span>
                </button>
                <span className="text-gray-800">/</span>
                {activeConnection.db_type === "flat_file" ? (
                  <p className="text-xs text-gray-400 flex items-center gap-1.5">
                    <span className="text-gray-200 font-medium">Uploaded Files</span>
                    <span className="text-[10px] text-emerald-600 bg-emerald-950/40 border border-emerald-900 rounded px-1 leading-4">flat file</span>
                    <span className="text-gray-700">·</span>
                    <span>{schema.length} table{schema.length !== 1 ? "s" : ""}</span>
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 flex items-center gap-1.5">
                    <span className="text-gray-200 font-medium">{activeConnection.name}</span>
                    <span className="text-[10px] text-gray-600 bg-gray-800 border border-gray-700 rounded px-1 leading-4">
                      {activeConnection.db_type === "postgres" ? "PG" : activeConnection.db_type === "snowflake" ? "SF" : (activeConnection.db_type ?? "DB").slice(0, 3).toUpperCase()}
                    </span>
                    <span className="text-gray-700">·</span>
                    <span>{activeConnection.database}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-3">
                <SchemaPanel
                  tables={schema}
                  annotations={annotations}
                  onAnnotate={handleAnnotate}
                  onRefresh={async () => {
                    if (!activeConnection) return;
                    const tables = await getConnectionSchema(jwt, activeConnection.id);
                    setSchema(tables);
                  }}
                />
                <div className="space-y-3">

                  {/* Mode toggle */}
                  <div className="flex items-center gap-2">
                    <div className="flex bg-gray-800 rounded-lg p-0.5 border border-gray-700 gap-0.5">
                      {(["ai", "sql", "chain"] as QueryMode[]).map((m) => (
                        <button
                          key={m}
                          onClick={() => setQueryMode(m)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            queryMode === m
                              ? "bg-indigo-600 text-white"
                              : "text-gray-400 hover:text-gray-200"
                          }`}
                        >
                          {m === "ai" ? "Ask AI" : m === "sql" ? "Write SQL" : "Chain"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AI mode */}
                  {queryMode === "ai" && (
                    <QueryInput onQuery={handleQuery} loading={loading} />
                  )}

                  {/* SQL mode */}
                  {queryMode === "sql" && (
                    <div className="space-y-2">
                      <div className="relative">
                        <textarea
                          value={sqlInput}
                          onChange={(e) => setSqlInput(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                              e.preventDefault();
                              handleRunSql();
                            }
                          }}
                          placeholder={"SELECT\n  *\nFROM your_table\nLIMIT 100"}
                          rows={7}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-3 pr-9 text-sm font-mono text-violet-300 resize-none focus:outline-none focus:border-indigo-500 placeholder:text-gray-700"
                          spellCheck={false}
                        />
                        {sqlVoice.supported && (
                          <button
                            type="button"
                            onClick={sqlVoice.toggle}
                            title={sqlVoice.listening ? "Stop recording" : "Dictate SQL (voice input)"}
                            className={`absolute right-2 top-2 p-1 rounded transition-colors ${
                              sqlVoice.listening ? "text-red-400 animate-pulse" : "text-gray-600 hover:text-gray-300"
                            }`}
                          >
                            <SqlMicIcon />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={handleRunSql}
                        disabled={loading || !sqlInput.trim()}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition-colors"
                      >
                        {loading ? "Running…" : "Run query"}
                        <span className="ml-2 text-[10px] text-indigo-300 font-normal">⌘↵</span>
                      </button>
                    </div>
                  )}

                  {/* Chain mode */}
                  {queryMode === "chain" && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">Write two queries on <span className="text-gray-300">{activeConnection.name}</span>, pick a join key, and generate a combined SQL query.</p>

                      {chainError && (
                        <p className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded px-3 py-2">{chainError}</p>
                      )}

                      {/* Query A */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Query A</span>
                          {resultA && <span className="text-[10px] text-emerald-500">{resultA.row_count.toLocaleString()} rows · {resultA.columns.join(", ")}</span>}
                        </div>
                        <div className="flex gap-2">
                          <textarea
                            value={sqlA}
                            onChange={(e) => { setSqlA(e.target.value); setResultA(null); }}
                            placeholder={"SELECT user_id, revenue\nFROM orders\nLIMIT 1000"}
                            rows={4}
                            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-xs font-mono text-violet-300 resize-none focus:outline-none focus:border-indigo-500 placeholder:text-gray-700"
                            spellCheck={false}
                          />
                          <button
                            onClick={handleRunChainA}
                            disabled={loadingA || !sqlA.trim()}
                            className="self-start px-3 py-2 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
                          >
                            {loadingA ? "…" : "Run A"}
                          </button>
                        </div>
                      </div>

                      {/* Query B */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Query B</span>
                          {resultB && <span className="text-[10px] text-emerald-500">{resultB.row_count.toLocaleString()} rows · {resultB.columns.join(", ")}</span>}
                        </div>
                        <div className="flex gap-2">
                          <textarea
                            value={sqlB}
                            onChange={(e) => { setSqlB(e.target.value); setResultB(null); }}
                            placeholder={"SELECT user_id, country\nFROM users"}
                            rows={4}
                            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-xs font-mono text-violet-300 resize-none focus:outline-none focus:border-indigo-500 placeholder:text-gray-700"
                            spellCheck={false}
                          />
                          <button
                            onClick={handleRunChainB}
                            disabled={loadingB || !sqlB.trim()}
                            className="self-start px-3 py-2 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
                          >
                            {loadingB ? "…" : "Run B"}
                          </button>
                        </div>
                      </div>

                      {/* Join config */}
                      <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-3 space-y-3">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Join config</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Key picker */}
                          <div className="space-y-1 flex-1 min-w-[140px]">
                            <label className="text-[10px] text-gray-600">Join key</label>
                            {resultA && resultB && resultA.columns.filter((c) => resultB.columns.includes(c)).length > 0 ? (
                              <select
                                value={joinKey}
                                onChange={(e) => setJoinKey(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-indigo-500"
                              >
                                <option value="">Pick a key…</option>
                                {resultA.columns.filter((c) => resultB.columns.includes(c)).map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={joinKey}
                                onChange={(e) => setJoinKey(e.target.value)}
                                placeholder={resultA && resultB ? "No shared columns — enter manually" : "e.g. user_id"}
                                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 outline-none focus:border-indigo-500"
                              />
                            )}
                          </div>

                          {/* Join type */}
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Join type</label>
                            <div className="flex gap-1">
                              {(["INNER", "LEFT", "RIGHT"] as JoinType[]).map((t) => (
                                <button
                                  key={t}
                                  onClick={() => setJoinType(t)}
                                  className={`px-2.5 py-1.5 text-xs rounded transition-colors ${
                                    joinType === t
                                      ? "bg-indigo-600 text-white"
                                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700"
                                  }`}
                                  title={t === "LEFT" ? "Keep all rows from A" : t === "RIGHT" ? "Keep all rows from B" : "Keep only matching rows"}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={buildMergeQuery}
                          disabled={!sqlA.trim() || !sqlB.trim() || !joinKey.trim()}
                          className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-medium transition-colors"
                        >
                          Build merge query →
                        </button>
                      </div>
                    </div>
                  )}

                  {result && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 flex-wrap">
                          {(["table", ...registry.all().map((d) => d.type)] as ChartType[]).map((t) => (
                            <button
                              key={t}
                              onClick={() => {
                                setChartType(t);
                                if (t !== "table" && result) {
                                  const def = registry.get(t);
                                  if (def) {
                                    const rows = result.rows.map((row) => {
                                      const obj: Record<string, unknown> = {};
                                      result.columns.forEach((col, i) => { obj[col] = row[i]; });
                                      return obj;
                                    });
                                    const derived = def.deriveConfig(result.columns, rows);
                                    const clean = Object.fromEntries(Object.entries(derived).filter(([, v]) => v !== undefined && v !== ""));
                                    setChartConfig((prev) => ({ ...prev, ...clean, type: t }));
                                  }
                                }
                              }}
                              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                                chartType === t
                                  ? "bg-indigo-600 text-white"
                                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                        {chartType !== "table" && (
                          <ChartCustomizer
                            config={chartConfig}
                            columns={result.columns}
                            onChange={(updates) => {
                              setChartConfig((prev) => ({ ...prev, ...updates }));
                              setIsDirty(true);
                            }}
                          />
                        )}
                      </div>

                      {chartType !== "table" && (
                        <div ref={chartContainerRef} className="border border-gray-800 rounded-lg overflow-hidden h-80">
                          <ChartView
                            chartType={chartType}
                            columns={result.columns}
                            rows={result.rows}
                            config={chartConfig}
                          />
                        </div>
                      )}

                      {/* Extra chart views */}
                      {extraViews.map((view) => (
                        <div key={view.id} className="border border-gray-800 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-2 flex-wrap px-3 pt-2.5 pb-2 border-b border-gray-800/60 bg-gray-900/40">
                            {(registry.all().map((d) => d.type) as ChartType[]).map((t) => (
                              <button
                                key={t}
                                onClick={() => updateExtraViewType(view.id, t)}
                                className={`text-xs px-2.5 py-1 rounded transition-colors ${
                                  view.chartType === t
                                    ? "bg-indigo-600 text-white"
                                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                                }`}
                              >
                                {t}
                              </button>
                            ))}
                            {view.chartType !== "table" && (
                              <ChartCustomizer
                                config={view.config}
                                columns={result.columns}
                                onChange={(updates) =>
                                  setExtraViews((prev) =>
                                    prev.map((v) =>
                                      v.id === view.id ? { ...v, config: { ...v.config, ...updates } } : v
                                    )
                                  )
                                }
                              />
                            )}
                            <div className="ml-auto flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  const el = extraChartRefs.current.get(view.id);
                                  if (el) downloadChartImage(el, slugFilename(lastQuestion, "png"));
                                }}
                                className="text-xs text-gray-600 hover:text-gray-300 transition-colors"
                                title="Download PNG"
                              >
                                PNG
                              </button>
                              <button
                                onClick={() => removeExtraView(view.id)}
                                className="text-gray-700 hover:text-red-400 transition-colors"
                                aria-label="Remove view"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div
                            ref={(el) => {
                              if (el) extraChartRefs.current.set(view.id, el);
                              else extraChartRefs.current.delete(view.id);
                            }}
                            className="h-72"
                          >
                            <ChartView
                              chartType={view.chartType}
                              columns={result.columns}
                              rows={result.rows}
                              config={view.config}
                            />
                          </div>
                        </div>
                      ))}

                      {/* Add chart view — only if there are unused chart types */}
                      {registry.all().some((d) => d.type !== chartType && !extraViews.find((v) => v.chartType === d.type)) && (
                        <button
                          onClick={addExtraView}
                          className="w-full text-xs text-gray-600 hover:text-gray-400 border border-dashed border-gray-800 hover:border-gray-700 rounded-lg py-2 transition-colors"
                        >
                          + Add chart view
                        </button>
                      )}

                      <ResultsTable result={result} />

                      <div className="flex gap-2 flex-wrap items-center">
                        <button
                          onClick={handleSaveQuery}
                          disabled={saved}
                          className="relative flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:border-indigo-500 hover:text-indigo-400 disabled:opacity-40 disabled:cursor-default transition-colors"
                        >
                          {isDirty && !saved && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" title="Unsaved changes" />
                          )}
                          {saved ? "Saved ✓" : "Save query"}
                          {!saved && <span className="text-[10px] text-gray-600">⌘S</span>}
                        </button>
                        <button
                          onClick={() => setShowSaveToDashboard(true)}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                            <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                          </svg>
                          Add to dashboard
                        </button>

                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            onClick={() => downloadCSV(result.columns, result.rows, slugFilename(queryMode === "ai" ? lastQuestion : (activeConnection?.name ?? "query"), "csv"))}
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-colors"
                            title="Download CSV"
                          >
                            <DownloadIcon />
                            CSV
                          </button>
                          {chartType !== "table" && (
                            <button
                              onClick={() => {
                                if (chartContainerRef.current)
                                  downloadChartImage(chartContainerRef.current, slugFilename(queryMode === "ai" ? lastQuestion : (activeConnection?.name ?? "query"), "png"));
                              }}
                              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-colors"
                              title="Download chart as PNG"
                            >
                              <DownloadIcon />
                              PNG
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showSaveToDashboard && result && activeConnection && (
        <SaveToDashboard
          jwt={jwt}
          connectionId={activeConnection.id}
          question={lastQuestion}
          sql={result.sql}
          chartType={chartType}
          chartConfig={chartConfig}
          onSaved={() => setShowSaveToDashboard(false)}
          onCancel={() => setShowSaveToDashboard(false)}
        />
      )}

      {/* Save toast */}
      <div
        className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl text-xs text-gray-200 transition-all duration-300 ${
          saveToast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-indigo-400 flex-shrink-0">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Query saved
      </div>
    </main>
  );
}

function SqlMicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600 flex-shrink-0">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v13M5 14l7 7 7-7" />
      <line x1="3" y1="21" x2="21" y2="21" />
    </svg>
  );
}
