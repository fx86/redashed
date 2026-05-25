"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { listDashboards, createDashboard, deleteDashboard } from "@/lib/api";
import type { Dashboard } from "@/lib/api";
import Nav from "@/components/Nav";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function DashboardListPage() {
  const { user, session, loading: authLoading } = useAuth();
  const jwt = session?.access_token ?? "";
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !authLoading && !user) router.replace("/");
  }, [mounted, authLoading, user, router]);

  useEffect(() => {
    if (!jwt) return;
    listDashboards(jwt)
      .then(setDashboards)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jwt]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const d = await createDashboard(jwt, newName.trim());
      router.push(`/dashboard/${d.id}`);
    } catch {
      setCreating(false);
    }
  }

  async function handleDelete(d: Dashboard, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${d.name}"?`)) return;
    await deleteDashboard(jwt, d.id).catch(() => {});
    setDashboards((prev) => prev.filter((x) => x.id !== d.id));
  }

  if (!mounted || authLoading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading…</div>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <Nav />

      <div className="max-w-[1080px] mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-base font-semibold text-gray-100">Dashboards</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New dashboard
          </button>
        </div>

        {/* Inline create form */}
        {showCreate && (
          <div className="mb-6 p-4 bg-gray-900 border border-indigo-600/40 rounded-xl">
            <p className="text-xs text-gray-400 mb-2">Dashboard name</p>
            <div className="flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setShowCreate(false); setNewName(""); }
                }}
                placeholder="e.g. Revenue Overview"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-sm rounded-lg transition-colors font-medium"
              >
                {creating ? "Creating…" : "Create"}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewName(""); }}
                className="px-3 py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && dashboards.length === 0 && (
          <div className="text-center py-24">
            <p className="text-gray-500 text-sm mb-4">No dashboards yet.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
            >
              Create your first dashboard →
            </button>
          </div>
        )}

        {/* Card grid */}
        {!loading && dashboards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.map((d) => (
              <div
                key={d.id}
                onClick={() => router.push(`/dashboard/${d.id}`)}
                className="group relative cursor-pointer bg-gray-900 border border-gray-800 hover:border-indigo-600/50 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-indigo-950/30"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h2 className="text-sm font-medium text-gray-100 leading-snug truncate flex-1">{d.name}</h2>
                  {!d.is_owner && (
                    <span className="text-[10px] text-indigo-400/80 font-medium px-1.5 py-0.5 bg-indigo-950/50 rounded flex-shrink-0">shared</span>
                  )}
                </div>
                <p className="text-xs text-gray-600">{relativeTime(d.created_at)}</p>

                {/* Hover actions */}
                {d.is_owner && (
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleDelete(d, e)}
                      className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                      aria-label="Delete dashboard"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
