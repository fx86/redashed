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
} from "@/lib/api";
import type { SavedConnection, TableInfo, QueryResponse, Annotation, Upload } from "@/lib/api";
import { selectChartType, useRegistry } from "@bi-tool/charts";
import type { ChartType, ChartConfig } from "@bi-tool/charts";
import Nav from "@/components/Nav";
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
type QueryMode = "ai" | "sql";

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

  const registry = useRegistry();
  const jwt = session?.access_token ?? "";

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

    listUserConnections(jwt)
      .then(async (allConns) => {
        const conns = allConns.filter((c) => c.db_type !== "flat_file");
        setConnections(conns);
        if (conns.length === 0) {
          const done = typeof window !== "undefined" && localStorage.getItem("onboarding_done");
          if (!done) { router.replace("/onboarding"); return; }
          return;
        }

        if (queryId) {
          try {
            const q = await getSavedQuery(jwt, queryId);
            const conn = conns.find((c) => c.id === q.connection_id) ?? conns[0];
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
          const conn = conns.find((c) => c.id === connectionId);
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
          await connectFirst(conns, jwt);
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
    setCurrentQueryId(null);
    setLastQuestion(sqlInput);
    try {
      const res = await runSql(jwt, activeConnection.id, sqlInput);
      applyResult(res, sqlInput);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }

  function applyResult(res: QueryResponse, question: string) {
    setResult(res);
    setLastQuestion(question);
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
              {/* Upload entry point — no connection needed */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-gray-200">Upload a file</h2>
                  {showUploadPanel && (
                    <button onClick={() => setShowUploadPanel(false)} className="text-xs text-gray-600 hover:text-gray-400">✕</button>
                  )}
                </div>
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
                />
                <div className="space-y-3">

                  {/* Mode toggle */}
                  <div className="flex items-center gap-2">
                    <div className="flex bg-gray-800 rounded-lg p-0.5 border border-gray-700 gap-0.5">
                      <button
                        onClick={() => setQueryMode("ai")}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          queryMode === "ai"
                            ? "bg-indigo-600 text-white"
                            : "text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        Ask AI
                      </button>
                      <button
                        onClick={() => setQueryMode("sql")}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          queryMode === "sql"
                            ? "bg-indigo-600 text-white"
                            : "text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        Write SQL
                      </button>
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
                        <div className="border border-gray-800 rounded-lg overflow-hidden h-80">
                          <ChartView
                            chartType={chartType}
                            columns={result.columns}
                            rows={result.rows}
                            config={chartConfig}
                          />
                        </div>
                      )}

                      <ResultsTable result={result} />

                      <div className="flex gap-2 flex-wrap">
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
