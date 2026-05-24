"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { listSavedQueries, listUserConnections, deleteSavedQuery } from "@/lib/api";
import type { SavedQuery, SavedConnection } from "@/lib/api";
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

  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jwt) return;
    Promise.all([listSavedQueries(jwt), listUserConnections(jwt)])
      .then(([qs, conns]) => {
        setQueries(qs);
        setConnections(conns);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jwt]);

  function connName(id: string | null) {
    if (!id) return "—";
    return connections.find((c) => c.id === id)?.name ?? "—";
  }

  async function handleDelete(id: string) {
    await deleteSavedQuery(jwt, id);
    setQueries((prev) => prev.filter((q) => q.id !== id));
  }

  const filtered = queries.filter((q) =>
    q.question.toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading || loading) {
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

      {/* Subbar */}
      <div className="flex items-center px-4 py-2.5 bg-gray-900 border-b border-gray-800 gap-3">
        <h1 className="text-[15px] font-medium text-gray-100">All Queries</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 flex-shrink-0">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="bg-transparent border-none outline-none text-gray-100 text-xs w-40 placeholder:text-gray-600"
              placeholder="Search queries…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <a href="/" className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors">
            + New query
          </a>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 320 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 120 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th className="bg-gray-800 px-4 py-2 text-left text-[10px] font-medium text-gray-500 border-b border-gray-700 uppercase tracking-wide" />
              <th className="bg-gray-800 px-4 py-2 text-left text-[10px] font-medium text-gray-500 border-b border-gray-700 uppercase tracking-wide">Name</th>
              <th className="bg-gray-800 px-4 py-2 text-left text-[10px] font-medium text-gray-500 border-b border-gray-700 uppercase tracking-wide">Source</th>
              <th className="bg-gray-800 px-4 py-2 text-left text-[10px] font-medium text-gray-500 border-b border-gray-700 uppercase tracking-wide">Saved</th>
              <th className="bg-gray-800 px-4 py-2 border-b border-gray-700" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-600">
                  {search ? "No queries match your search." : "No saved queries yet. Run a query and save it."}
                </td>
              </tr>
            )}
            {filtered.map((q) => (
              <tr key={q.id} className="group cursor-pointer hover:bg-gray-900 border-b border-gray-800/60">
                <td className="px-4 py-2 text-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-700 mx-auto">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </td>
                <td className="px-4 py-2 text-gray-100 font-medium truncate max-w-xs">{q.question}</td>
                <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{connName(q.connection_id)}</td>
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{relativeTime(q.created_at)}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 px-1"
                    aria-label="Delete query"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
