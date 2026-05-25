"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  listUserConnections, createUserConnection, deleteUserConnection,
  searchDataGov, importDataGov,
} from "@/lib/api";
import type { SavedConnection, DataGovDataset } from "@/lib/api";
import Nav from "@/components/Nav";
import SavedConnectionForm from "@/components/SavedConnectionForm";

export default function ConnectionsPage() {
  const { user, session, loading: authLoading } = useAuth();
  const jwt = session?.access_token ?? "";
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // data.gov state
  const [showDataGov, setShowDataGov] = useState(false);
  const [dgQuery, setDgQuery] = useState("");
  const [dgResults, setDgResults] = useState<DataGovDataset[]>([]);
  const [dgSearching, setDgSearching] = useState(false);
  const [dgError, setDgError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !authLoading && !user) router.replace("/");
  }, [mounted, authLoading, user, router]);

  useEffect(() => {
    if (!jwt) return;
    listUserConnections(jwt)
      .then(setConnections)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jwt]);

  async function handleAdd(body: {
    name: string; host: string; port: number;
    database: string; db_user: string; password: string;
  }) {
    setLoading(true);
    setError(null);
    try {
      const conn = await createUserConnection(jwt, body);
      setConnections((prev) => [...prev, conn]);
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add connection");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this connection? This cannot be undone.")) return;
    await deleteUserConnection(jwt, id);
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }

  function handleDgSearch(q: string) {
    setDgQuery(q);
    setDgError(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setDgResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setDgSearching(true);
      try {
        const results = await searchDataGov(jwt, q);
        setDgResults(results);
      } catch (e) {
        setDgError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setDgSearching(false);
      }
    }, 400);
  }

  async function handleImport(dataset: DataGovDataset, resource: { id: string; name: string; url: string }) {
    setImportingId(resource.id);
    setDgError(null);
    try {
      const conn = await importDataGov(jwt, {
        dataset_id: dataset.id,
        dataset_title: dataset.title,
        resource_url: resource.url,
      });
      setConnections((prev) => [...prev, conn]);
      setShowDataGov(false);
      setDgQuery("");
      setDgResults([]);
    } catch (e) {
      setDgError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportingId(null);
    }
  }

  function dbTypeBadge(db_type: string) {
    if (db_type === "datagov") return "GOV";
    if (db_type === "postgres") return "PG";
    if (db_type === "snowflake") return "SF";
    return (db_type ?? "DB").slice(0, 3).toUpperCase();
  }

  if (!mounted || authLoading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <span className="text-gray-500 text-sm">Loading…</span>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <Nav />

      <div className="max-w-2xl mx-auto px-4 py-3 md:py-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-gray-100">Connections</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowDataGov((v) => !v); setShowForm(false); setDgError(null); }}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                showDataGov
                  ? "bg-emerald-900/40 border-emerald-700 text-emerald-300"
                  : "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
              }`}
            >
              data.gov
            </button>
            {!showForm && (
              <button
                onClick={() => { setShowForm(true); setShowDataGov(false); setError(null); }}
                className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                + Add connection
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded p-3">{error}</p>
        )}

        {showForm && (
          <SavedConnectionForm
            onSave={handleAdd}
            onCancel={() => { setShowForm(false); setError(null); }}
            loading={loading}
          />
        )}

        {/* data.gov import panel */}
        {showDataGov && (
          <div className="border border-emerald-800/50 rounded-lg bg-emerald-950/20 p-4 space-y-3">
            <div>
              <p className="text-xs font-medium text-emerald-400 mb-2">Browse data.gov datasets</p>
              <input
                type="text"
                value={dgQuery}
                onChange={(e) => handleDgSearch(e.target.value)}
                placeholder="Search (e.g. unemployment, climate, census…)"
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-600"
                autoFocus
              />
            </div>

            {dgError && (
              <p className="text-xs text-red-400">{dgError}</p>
            )}

            {dgSearching && (
              <p className="text-xs text-gray-500">Searching…</p>
            )}

            {dgResults.length > 0 && (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {dgResults.map((dataset) => (
                  <div key={dataset.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
                    <div>
                      <p className="text-sm font-medium text-gray-100 leading-tight">{dataset.title}</p>
                      {dataset.organization && (
                        <p className="text-[11px] text-gray-500 mt-0.5">{dataset.organization}</p>
                      )}
                      {dataset.notes && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{dataset.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {dataset.resources.map((res) => (
                        <div key={res.id} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-500 truncate">{res.name}</span>
                          <button
                            onClick={() => handleImport(dataset, res)}
                            disabled={importingId !== null}
                            className="text-[11px] px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                          >
                            {importingId === res.id ? "Importing…" : "Import"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!dgSearching && dgQuery && dgResults.length === 0 && (
              <p className="text-xs text-gray-500">No CSV datasets found for "{dgQuery}".</p>
            )}
          </div>
        )}

        {!loading && connections.length === 0 && !showForm && (
          <p className="text-sm text-gray-500">No connections yet. Add one to start querying.</p>
        )}

        <div className="space-y-2">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="group flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium">{conn.name}</p>
                  <span className={`text-[10px] rounded px-1 leading-4 border ${
                    conn.db_type === "datagov"
                      ? "text-emerald-400 bg-emerald-950/40 border-emerald-800"
                      : "text-gray-600 bg-gray-800 border-gray-700"
                  }`}>
                    {dbTypeBadge(conn.db_type)}
                  </span>
                </div>
                {conn.db_type === "datagov" ? (
                  <p className="text-xs text-gray-500">data.gov dataset</p>
                ) : (
                  <p className="text-xs text-gray-500">{conn.host}:{conn.port} / {conn.database}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/?connection_id=${conn.id}`}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Query →
                </a>
                <button
                  onClick={() => handleDelete(conn.id)}
                  className="text-gray-700 hover:text-red-400 text-xs transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Delete connection"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
