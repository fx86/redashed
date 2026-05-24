"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  listUserConnections,
  createUserConnection,
  getConnectionSchema,
  runSavedConnectionQuery,
  runSql,
  saveQuery,
} from "@/lib/api";
import type { SavedConnection, TableInfo, QueryResponse } from "@/lib/api";
import { selectChartType } from "@bi-tool/charts";
import type { ChartType, ChartConfig } from "@bi-tool/charts";
import Nav from "@/components/Nav";
import SavedConnectionForm from "@/components/SavedConnectionForm";
import SchemaPanel from "@/components/SchemaPanel";
import QueryInput from "@/components/QueryInput";
import ResultsTable from "@/components/ResultsTable";
import ChartView from "@/components/ChartView";
import SaveToDashboard from "@/components/SaveToDashboard";

type AppStep = "connections" | "query";
type QueryMode = "ai" | "sql";

export default function Home() {
  const { user, session, loading: authLoading, signInWithGoogle } = useAuth();

  const [step, setStep] = useState<AppStep>("connections");
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [activeConnection, setActiveConnection] = useState<SavedConnection | null>(null);
  const [schema, setSchema] = useState<TableInfo[]>([]);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("table");
  const [chartConfig, setChartConfig] = useState<ChartConfig>({ type: "table" });
  const [showSaveToDashboard, setShowSaveToDashboard] = useState(false);
  const [queryMode, setQueryMode] = useState<QueryMode>("ai");
  const [sqlInput, setSqlInput] = useState("");

  const jwt = session?.access_token ?? "";

  useEffect(() => {
    if (!jwt) {
      setInitializing(false);
      return;
    }
    listUserConnections(jwt)
      .then(async (conns) => {
        setConnections(conns);
        if (conns.length > 0) {
          try {
            const tables = await getConnectionSchema(jwt, conns[0].id);
            setActiveConnection(conns[0]);
            setSchema(tables);
            setStep("query");
          } catch {
            // auto-connect failed, stay on connections page
          }
        }
      })
      .catch(() => {})
      .finally(() => setInitializing(false));
  }, [jwt]);

  async function handleSelectConnection(conn: SavedConnection) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const tables = await getConnectionSchema(jwt, conn.id);
      setActiveConnection(conn);
      setSchema(tables);
      setStep("query");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schema");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddConnection(body: {
    name: string;
    host: string;
    port: number;
    database: string;
    db_user: string;
    password: string;
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
    const config = selectChartType(res.columns, rows);
    setChartConfig(config);
    setChartType(config.type);
  }

  async function handleSaveQuery() {
    if (!result || !activeConnection) return;
    try {
      await saveQuery(jwt, {
        connection_id: activeConnection.id,
        question: lastQuestion,
        sql: result.sql,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save query");
    }
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
      <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center space-y-6 w-full max-w-sm">
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-white text-lg font-medium mx-auto">Q</div>
          <h1 className="text-2xl font-semibold text-gray-100 tracking-tight">Querywise</h1>
          <p className="text-gray-400 text-sm">
            Connect your data warehouse and ask questions in plain English.
          </p>
          <button
            onClick={signInWithGoogle}
            className="flex items-center gap-3 mx-auto px-5 py-3 rounded-lg bg-white text-gray-900 font-medium text-sm hover:bg-gray-100 transition-colors"
          >
            <GoogleIcon />
            Sign in with Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Nav />

      <div className="flex-1 p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded p-3">
              {error}
            </p>
          )}

          {step === "connections" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-400">Connections</h2>
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

              <div className="space-y-2">
                {connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{conn.name}</p>
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
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={goToConnections}
                  className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
                >
                  ←
                </button>
                <p className="text-sm text-gray-400">
                  <span className="text-gray-200">{activeConnection.name}</span>
                  <span className="mx-2 text-gray-700">/</span>
                  <span>{activeConnection.database}</span>
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
                <SchemaPanel tables={schema} />
                <div className="space-y-4">

                  {/* Mode toggle */}
                  <div className="flex items-center gap-3">
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
                      <textarea
                        value={sqlInput}
                        onChange={(e) => setSqlInput(e.target.value)}
                        placeholder={"SELECT\n  *\nFROM your_table\nLIMIT 100"}
                        rows={7}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-3 text-sm font-mono text-violet-300 resize-none focus:outline-none focus:border-indigo-500 placeholder:text-gray-700"
                        spellCheck={false}
                      />
                      <button
                        onClick={handleRunSql}
                        disabled={loading || !sqlInput.trim()}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition-colors"
                      >
                        {loading ? "Running…" : "Run query"}
                      </button>
                    </div>
                  )}

                  {result && (
                    <div className="space-y-3">
                      {chartConfig.type !== "table" && (
                        <div className="flex items-center gap-1">
                          {(["bar", "line", "scatter", "table"] as ChartType[]).map((t) => (
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
                      )}

                      {chartType !== "table" && (
                        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                          <ChartView
                            chartType={chartType}
                            columns={result.columns}
                            rows={result.rows}
                            x={chartConfig.x}
                            y={chartConfig.y}
                          />
                        </div>
                      )}

                      <ResultsTable result={result} />

                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveQuery}
                          disabled={saved}
                          className="text-xs px-3 py-1.5 rounded border border-gray-700 hover:border-indigo-500 hover:text-indigo-400 disabled:opacity-40 disabled:cursor-default transition-colors"
                        >
                          {saved ? "Saved ✓" : "Save query"}
                        </button>
                        <button
                          onClick={() => setShowSaveToDashboard(true)}
                          className="text-xs px-3 py-1.5 rounded border border-gray-700 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
                        >
                          Save to Dashboard
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
    </main>
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
