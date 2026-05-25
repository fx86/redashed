"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  listSavedQueries, listUserConnections, deleteSavedQuery, renameSavedQuery,
  listDashboards, createDashboardTile,
} from "@/lib/api";
import type { SavedQuery, SavedConnection, Dashboard } from "@/lib/api";
import Nav from "@/components/Nav";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function QueriesPage() {
  const { user, session, loading: authLoading } = useAuth();
  const jwt = session?.access_token ?? "";
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Add-to-dashboard modal
  const [addTarget, setAddTarget] = useState<SavedQuery | null>(null);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [adding, setAdding] = useState<string | null>(null); // dashboard id being added to
  const [added, setAdded] = useState<string | null>(null);   // dashboard id just confirmed

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !authLoading && !user) router.replace("/");
  }, [mounted, authLoading, user, router]);

  useEffect(() => {
    if (!jwt) return;
    Promise.all([listSavedQueries(jwt), listUserConnections(jwt)])
      .then(([qs, conns]) => { setQueries(qs); setConnections(conns); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jwt]);

  function connName(id: string | null) {
    if (!id) return "—";
    return connections.find((c) => c.id === id)?.name ?? "—";
  }

  function startEdit(q: SavedQuery) {
    setEditingId(q.id);
    setEditingValue(q.question);
    setTimeout(() => editInputRef.current?.select(), 0);
  }

  async function commitEdit(id: string) {
    const trimmed = editingValue.trim();
    if (trimmed && trimmed !== queries.find((q) => q.id === id)?.question) {
      try {
        const updated = await renameSavedQuery(jwt, id, trimmed);
        setQueries((prev) => prev.map((q) => (q.id === id ? updated : q)));
      } catch { /* keep old name on failure */ }
    }
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    await deleteSavedQuery(jwt, id);
    setQueries((prev) => prev.filter((q) => q.id !== id));
  }

  async function openAddModal(q: SavedQuery) {
    setAddTarget(q);
    setAdded(null);
    const list = await listDashboards(jwt).catch(() => []);
    setDashboards(list.filter((d) => d.can_edit));
  }

  async function handleAddToDashboard(dashboard: Dashboard) {
    if (!addTarget) return;
    setAdding(dashboard.id);
    try {
      await createDashboardTile(jwt, dashboard.id, { saved_query_id: addTarget.id });
      setAdded(dashboard.id);
    } catch { /* leave adding=null so user can retry */ }
    finally { setAdding(null); }
  }

  const filtered = queries.filter((q) =>
    q.question.toLowerCase().includes(search.toLowerCase())
  );

  if (!mounted || authLoading || loading) {
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

      {/* Subbar */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-[1080px] mx-auto flex items-center px-4 py-2.5 gap-3">
          <h1 className="text-sm font-semibold text-gray-100">All Queries</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 flex-shrink-0">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className="bg-transparent border-none outline-none text-gray-100 text-xs w-32 sm:w-40 placeholder:text-gray-600"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-[1080px] mx-auto">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <colgroup>
              <col />
              <col className="hidden sm:table-column" style={{ width: 160 }} />
              <col className="hidden sm:table-column" style={{ width: 100 }} />
              <col style={{ width: 90 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="bg-gray-800/60 px-4 py-2 text-left text-[10px] font-medium text-gray-500 border-b border-gray-800 uppercase tracking-wide">Name</th>
                <th className="hidden sm:table-cell bg-gray-800/60 px-4 py-2 text-left text-[10px] font-medium text-gray-500 border-b border-gray-800 uppercase tracking-wide">Source</th>
                <th className="hidden sm:table-cell bg-gray-800/60 px-4 py-2 text-left text-[10px] font-medium text-gray-500 border-b border-gray-800 uppercase tracking-wide">Saved</th>
                <th className="bg-gray-800/60 px-4 py-2 border-b border-gray-800" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-600">
                    {search ? "No queries match your search." : (
                      <span>No saved queries yet.{" "}<a href="/" className="text-indigo-400 hover:text-indigo-300">Run one →</a></span>
                    )}
                  </td>
                </tr>
              )}
              {filtered.map((q) => (
                <tr
                  key={q.id}
                  className="group cursor-pointer hover:bg-gray-900/60 border-b border-gray-800/60"
                  onClick={() => router.push(`/?query_id=${q.id}`)}
                >
                  <td className="px-4 py-2.5 min-w-0" onClick={(e) => e.stopPropagation()}>
                    {editingId === q.id ? (
                      <input
                        ref={editInputRef}
                        className="w-full bg-gray-800 border border-indigo-500 rounded px-2 py-0.5 text-gray-100 text-xs font-medium outline-none"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={() => commitEdit(q.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.currentTarget.blur(); }
                          if (e.key === "Escape") { setEditingId(null); }
                        }}
                      />
                    ) : (
                      <span
                        className="text-sm text-gray-100 font-medium truncate block cursor-text hover:text-white"
                        onDoubleClick={() => startEdit(q)}
                        title="Double-click to rename"
                      >
                        {q.question}
                      </span>
                    )}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-2.5 text-gray-400 whitespace-nowrap">{connName(q.connection_id)}</td>
                  <td className="hidden sm:table-cell px-4 py-2.5 text-gray-500 whitespace-nowrap">{relativeTime(q.created_at)}</td>
                  <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); openAddModal(q); }}
                        className="text-gray-500 hover:text-indigo-400 transition-colors text-[11px] font-medium whitespace-nowrap"
                      >
                        + Dashboard
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(q.id); }}
                        className="text-gray-700 hover:text-red-400 transition-colors px-1"
                        aria-label="Delete query"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add-to-dashboard modal */}
      {addTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setAddTarget(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-100">Add to dashboard</h2>
              <button onClick={() => setAddTarget(null)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
            </div>
            <p className="text-xs text-gray-500 truncate">{addTarget.question}</p>

            {dashboards.length === 0 ? (
              <p className="text-xs text-gray-600">No dashboards yet. Create one from the Dashboards page first.</p>
            ) : (
              <div className="space-y-2">
                {dashboards.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => handleAddToDashboard(d)}
                    disabled={!!adding || added === d.id}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      added === d.id
                        ? "border-indigo-500/50 bg-indigo-600/10 text-indigo-300"
                        : "border-gray-700 bg-gray-800 hover:border-gray-600 text-gray-200"
                    }`}
                  >
                    <span className="truncate">{d.name}</span>
                    {adding === d.id && <span className="text-xs text-gray-500 flex-shrink-0 ml-2">Adding…</span>}
                    {added === d.id && <span className="text-xs text-indigo-400 flex-shrink-0 ml-2">Added ✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
