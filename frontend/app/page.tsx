"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
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
import type { SavedConnection, TableInfo, QueryResponse, Annotation } from "@/lib/api";
import { selectChartType, useRegistry } from "@bi-tool/charts";
import type { ChartType, ChartConfig } from "@bi-tool/charts";
import Nav from "@/components/Nav";
import { useVoiceInput } from "@/lib/useVoiceInput";
import SavedConnectionForm from "@/components/SavedConnectionForm";
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
  const { user, session, loading: authLoading, signInWithGoogle } = useAuth();

  const [step, setStep] = useState<AppStep>("connections");
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [activeConnection, setActiveConnection] = useState<SavedConnection | null>(null);
  const [schema, setSchema] = useState<TableInfo[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
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
      .then(async (conns) => {
        setConnections(conns);
        if (conns.length === 0) return;

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
        <div className="bg-gray-900/80 border border-gray-700/60 rounded-2xl p-8 w-full max-w-xs shadow-2xl backdrop-blur-sm space-y-6">
          <div className="space-y-2">
            <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center text-white text-base font-semibold">Q</div>
            <h1 className="text-xl font-semibold text-gray-100 tracking-tight">Querywise</h1>
            <p className="text-sm text-gray-400 leading-relaxed">
              AI-powered queries on your own data warehouse.
            </p>
          </div>
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-600 hover:bg-gray-750 text-gray-200 font-medium text-sm transition-colors"
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <p className="text-[11px] text-gray-700 text-center">No credit card required</p>
        </div>
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-200">Connections</h2>
                <button
                  onClick={() => { setShowAddForm(true); setError(null); }}
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
                />
              )}

              {connections.length === 0 && !showAddForm && (
                <p className="text-sm text-gray-500">No connections yet. Add one to get started.</p>
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
                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                  <span className="text-gray-200 font-medium">{activeConnection.name}</span>
                  <span className="text-[10px] text-gray-600 bg-gray-800 border border-gray-700 rounded px-1 leading-4">
                    {activeConnection.db_type === "postgres" ? "PG" : activeConnection.db_type === "snowflake" ? "SF" : (activeConnection.db_type ?? "DB").slice(0, 3).toUpperCase()}
                  </span>
                  <span className="text-gray-700">·</span>
                  <span>{activeConnection.database}</span>
                </p>
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
                              onClick={() => setChartType(t)}
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
                        <div className="border border-gray-800 rounded-lg overflow-hidden">
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z" />
      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z" />
      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z" />
      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z" />
    </svg>
  );
}
