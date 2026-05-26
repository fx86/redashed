"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { listUserConnections, createUserConnection, deleteUserConnection, listUploads, deleteUpload } from "@/lib/api";
import type { SavedConnection, Upload } from "@/lib/api";
import Nav from "@/components/Nav";
import SavedConnectionForm from "@/components/SavedConnectionForm";

export default function ConnectionsPage() {
  const { user, session, loading: authLoading } = useAuth();
  const jwt = session?.access_token ?? "";
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !authLoading && !user) router.replace("/");
  }, [mounted, authLoading, user, router]);

  useEffect(() => {
    if (!jwt) return;
    Promise.all([listUserConnections(jwt), listUploads(jwt)])
      .then(([conns, ups]) => {
        setConnections(conns.filter((c) => c.db_type !== "flat_file"));
        setUploads(ups);
      })
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

  async function handleDeleteUpload(id: string) {
    if (!window.confirm("Delete this uploaded table? The data will be removed.")) return;
    await deleteUpload(jwt, id);
    setUploads((prev) => prev.filter((u) => u.id !== id));
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
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setError(null); }}
              className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 transition-colors"
            >
              + Add connection
            </button>
          )}
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
                  <span className="text-[10px] text-gray-600 bg-gray-800 border border-gray-700 rounded px-1 leading-4">
                    {conn.db_type === "postgres" ? "PG" : conn.db_type === "snowflake" ? "SF" : (conn.db_type ?? "DB").slice(0, 3).toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{conn.host}:{conn.port} / {conn.database}</p>
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

        {/* Flat file uploads — manage existing, upload from the home page */}
        {uploads.length > 0 && (
          <div className="pt-2 border-t border-gray-800">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">Uploaded files</h2>
            <div className="space-y-1.5">
              {uploads.map((u) => (
                <div
                  key={u.id}
                  className="group flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{u.table_name}</p>
                      <span className="text-[10px] text-emerald-600 bg-emerald-950/40 border border-emerald-900 rounded px-1 leading-4 flex-shrink-0">
                        uploaded
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {u.original_filename} · {u.row_count.toLocaleString()} rows · {u.col_count} cols
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    {u.connection_id && (
                      <a
                        href={`/?connection_id=${u.connection_id}`}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        Query →
                      </a>
                    )}
                    <button
                      onClick={() => handleDeleteUpload(u.id)}
                      className="text-gray-700 hover:text-red-400 text-xs transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Delete upload"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
