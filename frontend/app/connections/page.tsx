"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { listUserConnections, createUserConnection, deleteUserConnection } from "@/lib/api";
import type { SavedConnection } from "@/lib/api";
import Nav from "@/components/Nav";
import SavedConnectionForm from "@/components/SavedConnectionForm";

export default function ConnectionsPage() {
  const { user, session, loading: authLoading } = useAuth();
  const jwt = session?.access_token ?? "";

  const [mounted, setMounted] = useState(false);
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

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
    await deleteUserConnection(jwt, id);
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }

  if (!mounted || authLoading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <span className="text-gray-500 text-sm">Loading…</span>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <a href="/" className="text-indigo-400 text-sm underline">Sign in</a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <Nav />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-medium text-gray-400">Connections</h1>
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
              className="group flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{conn.name}</p>
                <p className="text-xs text-gray-500">{conn.host}:{conn.port} / {conn.database}</p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href="/"
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
