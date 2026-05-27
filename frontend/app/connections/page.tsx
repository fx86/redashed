"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  listUserConnections, createUserConnection, deleteUserConnection,
  listUploads, deleteUpload, pingConnection,
} from "@/lib/api";
import type { SavedConnection, Upload } from "@/lib/api";

type PingStatus = "checking" | "ok" | "error";
import Nav from "@/components/Nav";
import SavedConnectionForm from "@/components/SavedConnectionForm";

function StatusDot({ status }: { status: PingStatus | undefined }) {
  if (!status) return null;
  const cls =
    status === "ok" ? "bg-emerald-500" :
    status === "error" ? "bg-red-500" :
    "bg-gray-600 animate-pulse";
  const title =
    status === "ok" ? "Connected" :
    status === "error" ? "Connection error" :
    "Checking…";
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cls}`} title={title} />;
}

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
  const [confirmDelete, setConfirmDelete] = useState<{ type: "connection"; item: SavedConnection } | { type: "upload"; item: Upload } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pingStatus, setPingStatus] = useState<Record<string, PingStatus>>({});

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !authLoading && !user) router.replace("/");
  }, [mounted, authLoading, user, router]);

  useEffect(() => {
    if (!jwt) return;
    Promise.all([listUserConnections(jwt), listUploads(jwt)])
      .then(([conns, ups]) => {
        const filtered = conns.filter((c) => c.db_type !== "flat_file");
        setConnections(filtered);
        setUploads(ups);
        // Initialise all as checking, then ping in parallel
        const initial: Record<string, PingStatus> = {};
        filtered.forEach((c) => { initial[c.id] = "checking"; });
        setPingStatus(initial);
        filtered.forEach((c) => {
          pingConnection(jwt, c.id)
            .then((r) => setPingStatus((prev) => ({ ...prev, [c.id]: r.ok ? "ok" : "error" })))
            .catch(() => setPingStatus((prev) => ({ ...prev, [c.id]: "error" })));
        });
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

  function handleDataGovImport(conn: SavedConnection) {
    setConnections((prev) => [...prev, conn]);
    setShowForm(false);
    setError(null);
  }

  async function confirmAndDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.type === "connection") {
        await deleteUserConnection(jwt, confirmDelete.item.id);
        setConnections((prev) => prev.filter((c) => c.id !== confirmDelete.item.id));
      } else {
        await deleteUpload(jwt, confirmDelete.item.id);
        setUploads((prev) => prev.filter((u) => u.id !== confirmDelete.item.id));
      }
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
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
            jwt={jwt}
            onDataGovImport={handleDataGovImport}
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
                  <StatusDot status={pingStatus[conn.id]} />
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
                  href={`/connections/${conn.id}/schema`}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Annotate
                </a>
                <a
                  href={`/?connection_id=${conn.id}`}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Query →
                </a>
                <button
                  onClick={() => setConfirmDelete({ type: "connection", item: conn })}
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
                      onClick={() => setConfirmDelete({ type: "upload", item: u })}
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

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-full max-w-sm shadow-2xl">
            <h2 className="text-sm font-semibold text-gray-100 mb-1">
              {confirmDelete.type === "connection" ? "Delete connection?" : "Delete uploaded table?"}
            </h2>
            <p className="text-xs text-gray-400 mb-1">
              <span className="text-gray-200 font-medium">
                {confirmDelete.type === "connection" ? confirmDelete.item.name : confirmDelete.item.table_name}
              </span>{" "}
              will be permanently removed.
            </p>
            {confirmDelete.type === "connection" && confirmDelete.item.db_type === "datagov" && (
              <p className="text-xs text-amber-400 mb-3">The ingested dataset will also be dropped from the database.</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="text-xs px-3 py-1.5 rounded border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmAndDelete}
                disabled={deleting}
                className="text-xs px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
