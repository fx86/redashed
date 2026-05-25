"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ResponsiveGridLayout } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import { useContainerWidth } from "react-grid-layout/react";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useAuth } from "@/lib/auth";
import {
  listDashboards,
  listDashboardTiles,
  deleteDashboard,
  deleteDashboardTile,
  runSql,
  updateDashboardLayout,
  listDashboardEditors,
  addDashboardEditor,
  removeDashboardEditor,
} from "@/lib/api";
import type { Dashboard, DashboardTile, DashboardEditor, QueryResponse } from "@/lib/api";
import { selectChartType, useRegistry } from "@bi-tool/charts";
import type { ChartConfig, ChartType } from "@bi-tool/charts";
import ChartView from "@/components/ChartView";
import Nav from "@/components/Nav";

export default function DashboardViewPage() {
  const { user, session, loading: authLoading } = useAuth();
  const registry = useRegistry();
  const jwt = session?.access_token ?? "";
  const router = useRouter();
  const params = useParams();
  const dashboardId = params.id as string;

  const [mounted, setMounted] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [tiles, setTiles] = useState<DashboardTile[]>([]);
  const [results, setResults] = useState<Record<string, QueryResponse>>({});
  const [chartConfigs, setChartConfigs] = useState<Record<string, ChartConfig>>({});
  const [tileLoading, setTileLoading] = useState<Record<string, boolean>>({});
  const [tileErrors, setTileErrors] = useState<Record<string, string>>({});
  const [pageLoading, setPageLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);

  // Share modal
  const [shareOpen, setShareOpen] = useState(false);
  const [editors, setEditors] = useState<DashboardEditor[]>([]);
  const [newEditorId, setNewEditorId] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);

  const { width: containerWidth, containerRef } = useContainerWidth({ initialWidth: 900 });
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768); }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dashboardRef = useRef<Dashboard | null>(null);
  dashboardRef.current = dashboard;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !authLoading && !user) router.replace("/");
  }, [mounted, authLoading, user, router]);

  useEffect(() => {
    if (!jwt || !dashboardId) return;

    async function load() {
      setPageLoading(true);
      try {
        // Find the dashboard from the list (no dedicated GET /{id} endpoint yet)
        const all = await listDashboards(jwt);
        const dash = all.find((d) => d.id === dashboardId);
        if (!dash) { router.replace("/dashboard"); return; }
        setDashboard(dash);

        const t = await listDashboardTiles(jwt, dashboardId);
        setTiles(t);

        // Set all tiles to loading state before fetching in parallel
        const initLoading: Record<string, boolean> = {};
        t.forEach((tile) => { initLoading[tile.id] = true; });
        setTileLoading(initLoading);

        // Run each tile's query and update state as results arrive
        await Promise.all(
          t.map(async (tile) => {
            try {
              const r = await runSql(jwt, tile.connection_id, tile.sql);
              const rows = r.rows.map((row) => {
                const obj: Record<string, unknown> = {};
                r.columns.forEach((col, i) => { obj[col] = row[i]; });
                return obj;
              });
              const savedConfig = tile.chart_config as ChartConfig;
              const config = savedConfig?.type
                ? savedConfig
                : selectChartType(r.columns, rows, registry);

              setResults((prev) => ({ ...prev, [tile.id]: r }));
              setChartConfigs((prev) => ({ ...prev, [tile.id]: config }));
            } catch (e) {
              setTileErrors((prev) => ({
                ...prev,
                [tile.id]: e instanceof Error ? e.message : "Query failed",
              }));
            } finally {
              setTileLoading((prev) => ({ ...prev, [tile.id]: false }));
            }
          })
        );
      } catch {
        router.replace("/dashboard");
      } finally {
        setPageLoading(false);
      }
    }

    load();
  }, [jwt, dashboardId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLayoutChange = useCallback(
    (currentLayout: Layout) => {
      const dash = dashboardRef.current;
      if (!dash?.can_edit) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateDashboardLayout(
          jwt,
          dash.id,
          currentLayout.map((l) => ({ id: l.i, x: l.x, y: l.y, w: l.w, h: l.h })),
        ).catch(() => {});
      }, 800);
    },
    [jwt],
  );

  async function handleDeleteTile(tile: DashboardTile) {
    await deleteDashboardTile(jwt, tile.dashboard_id, tile.id);
    setTiles((prev) => prev.filter((t) => t.id !== tile.id));
  }

  async function handleDeleteDashboard() {
    if (!dashboard) return;
    if (!confirm(`Delete "${dashboard.name}"?`)) return;
    await deleteDashboard(jwt, dashboard.id);
    router.replace("/dashboard");
  }

  async function openShare() {
    setShareOpen(true);
    setEditorLoading(true);
    try {
      const list = await listDashboardEditors(jwt, dashboardId);
      setEditors(list);
    } catch { setEditors([]); }
    finally { setEditorLoading(false); }
  }

  async function handleAddEditor() {
    if (!newEditorId.trim()) return;
    setEditorLoading(true);
    try {
      const editor = await addDashboardEditor(jwt, dashboardId, newEditorId.trim());
      setEditors((prev) => [...prev, editor]);
      setNewEditorId("");
    } catch { /* user can retry */ }
    finally { setEditorLoading(false); }
  }

  async function handleRemoveEditor(userId: string) {
    setEditorLoading(true);
    try {
      await removeDashboardEditor(jwt, dashboardId, userId);
      setEditors((prev) => prev.filter((e) => e.user_id !== userId));
    } finally { setEditorLoading(false); }
  }

  if (!mounted || authLoading || pageLoading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading…</div>
      </main>
    );
  }

  if (!user || !dashboard) return null;

  // canEdit = permission AND user has explicitly toggled edit mode
  const canEdit = dashboard.can_edit && editMode;
  const gridLayout = tiles.map((tile) => ({
    i: tile.id,
    x: tile.layout?.x ?? 0,
    y: tile.layout?.y ?? 0,
    w: tile.layout?.w ?? 6,
    h: tile.layout?.h ?? 4,
    minW: 3,
    minH: 2,
  }));

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Nav />

      {/* Dashboard header */}
      <div className="bg-gray-900/60 border-b border-gray-800 flex-shrink-0">
        <div className="max-w-[1080px] mx-auto px-4 py-2.5 flex items-center gap-3">
          <a
            href="/dashboard"
            className="text-gray-500 hover:text-gray-300 text-xs flex items-center gap-1 transition-colors flex-shrink-0"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Dashboards
          </a>
          <span className="text-gray-700 text-xs">/</span>
          <h1 className="text-sm font-medium text-gray-100 truncate flex-1">{dashboard.name}</h1>

          <div className="flex items-center gap-2 flex-shrink-0">
            {!dashboard.is_owner && (
              <span className="text-[10px] text-indigo-400/70 font-medium px-1.5 py-0.5 bg-indigo-950/50 rounded">shared</span>
            )}

            {/* Edit mode toggle — only shown to users with edit permission */}
            {dashboard.can_edit && (
              <button
                onClick={() => setEditMode((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                  editMode
                    ? "bg-indigo-600 text-white hover:bg-indigo-500"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                {editMode ? "Editing" : "Edit"}
              </button>
            )}

            {dashboard.is_owner && (
              <button
                onClick={openShare}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-indigo-400 hover:bg-gray-800 rounded-md transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Share
              </button>
            )}
            {dashboard.is_owner && editMode && (
              <button
                onClick={handleDeleteDashboard}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-red-400 hover:bg-red-950/20 rounded-md transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tile grid */}
      <div className="flex-1 p-4 max-w-[1080px] mx-auto w-full">
        {tiles.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-gray-600 text-sm">No tiles in this dashboard yet.</p>
            <a href="/" className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
              Run a query and add it here →
            </a>
          </div>
        )}

        {tiles.length > 0 && (
          <div ref={containerRef}>
            {/* Mobile: simple stacked list */}
            {isMobile && (
              <div className="flex flex-col gap-2">
                {[...tiles]
                  .sort((a, b) => {
                    const ay = a.layout?.y ?? 0, by = b.layout?.y ?? 0;
                    return ay !== by ? ay - by : (a.layout?.x ?? 0) - (b.layout?.x ?? 0);
                  })
                  .map((tile) => {
                    const res = results[tile.id];
                    const config = chartConfigs[tile.id] ?? { type: "table" };
                    const ct = config.type as ChartType;
                    const isLoading = tileLoading[tile.id];
                    const error = tileErrors[tile.id];
                    const tileH = (tile.layout?.h ?? 4) * 100 + 8;
                    return (
                      <div
                        key={tile.id}
                        className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col"
                        style={{ height: tileH }}
                      >
                        <div className="px-3 pt-2.5 pb-2 border-b border-gray-800/60 flex-shrink-0 flex items-center justify-between gap-2">
                          <p className="text-sm text-gray-100 font-medium leading-snug truncate flex-1">{tile.question}</p>
                          <a href={`/?query_id=${tile.saved_query_id}`} className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-indigo-400 hover:bg-indigo-950/40 transition-colors">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </a>
                        </div>
                        <div className="flex-1 overflow-auto p-2 min-h-0">
                          {isLoading && <div className="flex flex-col gap-2 h-full justify-center px-2"><div className="h-2 bg-gray-800 rounded animate-pulse w-3/4" /><div className="h-2 bg-gray-800 rounded animate-pulse w-1/2" /></div>}
                          {!isLoading && error && <p className="text-xs text-red-400 p-2">{error}</p>}
                          {!isLoading && res && ct !== "table" && (
                            <div className="h-full overflow-hidden rounded">
                              <ChartView chartType={ct} columns={res.columns} rows={res.rows} config={config} />
                            </div>
                          )}
                          {!isLoading && res && ct === "table" && (
                            <table className="text-xs w-full"><thead><tr>{res.columns.map((c) => <th key={c} className="text-left text-gray-500 pb-1 pr-3 font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
                              <tbody>{res.rows.slice(0, 20).map((row, i) => <tr key={i} className="border-t border-gray-800">{(row as unknown[]).map((cell, j) => <td key={j} className="py-1 pr-3 text-gray-300 whitespace-nowrap">{String(cell ?? "")}</td>)}</tr>)}</tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Desktop: draggable/resizable grid */}
            {!isMobile && <ResponsiveGridLayout
              className="layout"
              width={containerWidth}
              layouts={{ lg: gridLayout, md: gridLayout }}
              breakpoints={{ lg: 1200, md: 0 }}
              cols={{ lg: 12, md: 12 }}
              rowHeight={100}
              margin={[8, 8] as const}
              dragConfig={{ enabled: canEdit, handle: ".drag-handle" }}
              resizeConfig={{ enabled: canEdit, handles: ["se"] as const }}
              onLayoutChange={canEdit ? handleLayoutChange : undefined}
            >
              {tiles.map((tile) => {
                const res = results[tile.id];
                const config = chartConfigs[tile.id] ?? { type: "table" };
                const ct = config.type as ChartType;
                const isLoading = tileLoading[tile.id];
                const error = tileErrors[tile.id];

                return (
                  <div
                    key={tile.id}
                    className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col"
                  >
                    {/* Tile header */}
                    <div className={`drag-handle px-3 pt-2.5 pb-2 border-b border-gray-800/60 flex-shrink-0 flex items-center justify-between gap-2 ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}>
                      <p className="text-sm text-gray-100 font-medium leading-snug select-none truncate flex-1">{tile.question}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <a
                          href={`/?query_id=${tile.saved_query_id}`}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="Edit query"
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-indigo-400 hover:bg-indigo-950/40 transition-colors"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </a>
                        {canEdit && (
                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => handleDeleteTile(tile)}
                            className="w-6 h-6 flex items-center justify-center rounded text-gray-700 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                            aria-label="Remove tile"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tile content */}
                    <div className="flex-1 overflow-auto p-2 min-h-0">
                      {/* Loading skeleton */}
                      {isLoading && (
                        <div className="flex flex-col gap-2 h-full justify-center px-2">
                          <div className="h-2 bg-gray-800 rounded animate-pulse w-3/4" />
                          <div className="h-2 bg-gray-800 rounded animate-pulse w-1/2" />
                          <div className="h-2 bg-gray-800 rounded animate-pulse w-5/6" />
                        </div>
                      )}

                      {/* Error state */}
                      {!isLoading && error && (
                        <div className="flex flex-col items-center justify-center h-full gap-2 py-6 text-center">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500 flex-shrink-0">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <p className="text-xs text-red-400 max-w-[200px] leading-relaxed">{error}</p>
                          <a href={`/?query_id=${tile.saved_query_id}`} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                            Edit query ↗
                          </a>
                        </div>
                      )}

                      {/* Chart */}
                      {!isLoading && res && ct !== "table" && (
                        <div className="h-full overflow-hidden rounded">
                          <ChartView chartType={ct} columns={res.columns} rows={res.rows} config={config} />
                        </div>
                      )}

                      {/* Table fallback */}
                      {!isLoading && res && ct === "table" && (
                        <table className="text-xs w-full">
                          <thead>
                            <tr>
                              {res.columns.map((c) => (
                                <th key={c} className="text-left text-gray-500 pb-1 pr-3 font-medium whitespace-nowrap">{c}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {res.rows.slice(0, 20).map((row, i) => (
                              <tr key={i} className="border-t border-gray-800">
                                {row.map((cell, j) => (
                                  <td key={j} className="py-1 pr-3 text-gray-300 whitespace-nowrap">{String(cell ?? "")}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                );
              })}
            </ResponsiveGridLayout>}
          </div>
        )}
      </div>

      {/* Share modal */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-100">Share &ldquo;{dashboard.name}&rdquo;</h2>
              <button onClick={() => setShareOpen(false)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
            </div>
            <p className="text-xs text-gray-500">Paste a user&apos;s ID to grant edit access.</p>

            <div className="flex gap-2">
              <input
                className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-100 placeholder:text-gray-600 outline-none focus:border-indigo-500"
                placeholder="User ID (UUID)"
                value={newEditorId}
                onChange={(e) => setNewEditorId(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddEditor(); }}
              />
              <button
                onClick={handleAddEditor}
                disabled={editorLoading || !newEditorId.trim()}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs rounded-md transition-colors"
              >
                Add
              </button>
            </div>

            <div className="space-y-2">
              {editorLoading && editors.length === 0 && <p className="text-xs text-gray-600">Loading…</p>}
              {!editorLoading && editors.length === 0 && (
                <p className="text-xs text-gray-600">No editors yet. Only you can edit this dashboard.</p>
              )}
              {editors.map((e) => (
                <div key={e.user_id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-300 font-mono truncate max-w-[280px]">{e.user_id}</span>
                  <button
                    onClick={() => handleRemoveEditor(e.user_id)}
                    disabled={editorLoading}
                    className="text-gray-600 hover:text-red-400 text-xs transition-colors flex-shrink-0 ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
