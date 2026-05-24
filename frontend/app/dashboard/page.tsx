"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveGridLayout } from "react-grid-layout";
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
  updateTileConfig,
  listDashboardEditors,
  addDashboardEditor,
  removeDashboardEditor,
} from "@/lib/api";
import type { Dashboard, DashboardTile, DashboardEditor, QueryResponse } from "@/lib/api";
import { selectChartType, useRegistry } from "@bi-tool/charts";
import type { ChartConfig, ChartType } from "@bi-tool/charts";
import ChartView from "@/components/ChartView";
import Nav from "@/components/Nav";

export default function DashboardPage() {
  const { user, session, loading: authLoading } = useAuth();
  const registry = useRegistry();
  const jwt = session?.access_token ?? "";
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [activeDashboard, setActiveDashboard] = useState<Dashboard | null>(null);
  const [tiles, setTiles] = useState<DashboardTile[]>([]);
  const [results, setResults] = useState<Record<string, QueryResponse>>({});
  const [chartConfigs, setChartConfigs] = useState<Record<string, ChartConfig>>({});
  const [loading, setLoading] = useState(false);

  // Share modal state
  const [shareTarget, setShareTarget] = useState<Dashboard | null>(null);
  const [editors, setEditors] = useState<DashboardEditor[]>([]);
  const [newEditorId, setNewEditorId] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);

  const { width: containerWidth, containerRef } = useContainerWidth({ initialWidth: 900 });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDashboardRef = useRef<Dashboard | null>(null);
  activeDashboardRef.current = activeDashboard;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !authLoading && !user) router.replace("/");
  }, [mounted, authLoading, user, router]);

  useEffect(() => {
    if (!jwt) return;
    listDashboards(jwt).then(setDashboards).catch(() => {});
  }, [jwt]);

  async function openDashboard(d: Dashboard) {
    setActiveDashboard(d);
    setLoading(true);
    try {
      const t = await listDashboardTiles(jwt, d.id);
      setTiles(t);
      const res: Record<string, QueryResponse> = {};
      const configs: Record<string, ChartConfig> = {};
      await Promise.all(
        t.map(async (tile) => {
          try {
            const r = await runSql(jwt, tile.connection_id, tile.sql);
            res[tile.id] = r;
            const rows = r.rows.map((row) => {
              const obj: Record<string, unknown> = {};
              r.columns.forEach((col, i) => { obj[col] = row[i]; });
              return obj;
            });
            const savedConfig = tile.chart_config as ChartConfig;
            configs[tile.id] = savedConfig?.type
              ? savedConfig
              : selectChartType(r.columns, rows, registry);
          } catch { /* tile fails silently */ }
        })
      );
      setResults(res);
      setChartConfigs(configs);
    } finally {
      setLoading(false);
    }
  }

  const handleLayoutChange = useCallback(
    (currentLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => {
      const dash = activeDashboardRef.current;
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

  async function handleChartTypeChange(tile: DashboardTile, newType: ChartType) {
    const current = chartConfigs[tile.id] ?? { type: "table" };
    const updated: ChartConfig = { ...current, type: newType };
    // Optimistic update
    setChartConfigs((prev) => ({ ...prev, [tile.id]: updated }));
    // Persist to backend — only reachable when can_edit is true
    try {
      await updateTileConfig(jwt, tile.dashboard_id, tile.id, newType, updated);
    } catch {
      // Roll back on failure
      setChartConfigs((prev) => ({ ...prev, [tile.id]: current }));
    }
  }

  async function handleDeleteTile(tile: DashboardTile) {
    await deleteDashboardTile(jwt, tile.dashboard_id, tile.id);
    setTiles((prev) => prev.filter((t) => t.id !== tile.id));
  }

  async function handleDeleteDashboard(d: Dashboard) {
    await deleteDashboard(jwt, d.id);
    setDashboards((prev) => prev.filter((x) => x.id !== d.id));
    if (activeDashboard?.id === d.id) {
      setActiveDashboard(null);
      setTiles([]);
    }
  }

  // Share modal helpers
  async function openShareModal(d: Dashboard) {
    setShareTarget(d);
    setEditorLoading(true);
    try {
      const list = await listDashboardEditors(jwt, d.id);
      setEditors(list);
    } catch {
      setEditors([]);
    } finally {
      setEditorLoading(false);
    }
  }

  async function handleAddEditor() {
    if (!shareTarget || !newEditorId.trim()) return;
    setEditorLoading(true);
    try {
      const editor = await addDashboardEditor(jwt, shareTarget.id, newEditorId.trim());
      setEditors((prev) => [...prev, editor]);
      setNewEditorId("");
    } catch { /* show nothing — user can retry */ }
    finally { setEditorLoading(false); }
  }

  async function handleRemoveEditor(userId: string) {
    if (!shareTarget) return;
    setEditorLoading(true);
    try {
      await removeDashboardEditor(jwt, shareTarget.id, userId);
      setEditors((prev) => prev.filter((e) => e.user_id !== userId));
    } finally { setEditorLoading(false); }
  }

  if (!mounted || authLoading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading…</div>
      </main>
    );
  }

  if (!user) return null;

  const chartTypes = registry.all().map((d) => d.type);

  const gridLayout = tiles.map((tile) => ({
    i: tile.id,
    x: tile.layout?.x ?? 0,
    y: tile.layout?.y ?? 0,
    w: tile.layout?.w ?? 6,
    h: tile.layout?.h ?? 4,
    minW: 3,
    minH: 2,
  }));

  const canEdit = activeDashboard?.can_edit ?? false;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Nav />
      <div className="flex-1 p-4 md:p-6">
        <div className="max-w-[1400px] mx-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-start">
            {/* Sidebar */}
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Dashboards</p>
              {dashboards.length === 0 && (
                <p className="text-xs text-gray-600">No dashboards yet. Save a query from the query view.</p>
              )}
              {dashboards.map((d) => (
                <div
                  key={d.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                    activeDashboard?.id === d.id
                      ? "bg-indigo-600/20 border border-indigo-600/40"
                      : "bg-gray-900 border border-gray-800 hover:border-gray-700"
                  }`}
                  onClick={() => openDashboard(d)}
                >
                  <span className="text-sm truncate flex-1 min-w-0">{d.name}</span>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {d.is_owner && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openShareModal(d); }}
                        className="text-gray-600 hover:text-indigo-400 text-xs transition-colors"
                        aria-label="Share dashboard"
                        title="Share"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                        </svg>
                      </button>
                    )}
                    {d.is_owner && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteDashboard(d); }}
                        className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                        aria-label="Delete dashboard"
                      >
                        ✕
                      </button>
                    )}
                    {!d.is_owner && (
                      <span className="text-[10px] text-indigo-400/70 font-medium">shared</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Grid canvas */}
            <div>
              {!activeDashboard && (
                <p className="text-sm text-gray-600">Select a dashboard to view its charts.</p>
              )}
              {activeDashboard && loading && (
                <p className="text-sm text-gray-500">Loading tiles…</p>
              )}
              {activeDashboard && !loading && tiles.length === 0 && (
                <p className="text-sm text-gray-600">No tiles in this dashboard yet.</p>
              )}

              {activeDashboard && !loading && tiles.length > 0 && (
                <div ref={containerRef}>
                  <ResponsiveGridLayout
                    className="layout"
                    width={containerWidth}
                    layouts={{ lg: gridLayout, md: gridLayout, sm: gridLayout }}
                    breakpoints={{ lg: 1200, md: 768, sm: 480 }}
                    cols={{ lg: 12, md: 10, sm: 6 }}
                    rowHeight={100}
                    margin={[8, 8]}
                    draggableHandle=".drag-handle"
                    isDraggable={canEdit}
                    isResizable={canEdit}
                    onLayoutChange={canEdit ? handleLayoutChange : undefined}
                    resizeHandles={["se"]}
                  >
                    {tiles.map((tile) => {
                      const res = results[tile.id];
                      const config = chartConfigs[tile.id] ?? { type: "table" };
                      const ct = config.type as ChartType;
                      return (
                        <div
                          key={tile.id}
                          className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col"
                        >
                          {/* Header */}
                          <div className={`drag-handle px-4 pt-3 pb-2 border-b border-gray-800/60 flex-shrink-0 ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}>
                            {/* Title row — full width */}
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm text-gray-100 font-medium leading-snug select-none">{tile.question}</p>
                              <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                                <a
                                  href={`/?query_id=${tile.saved_query_id}`}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  title="Open in editor"
                                  className="w-5 h-5 flex items-center justify-center rounded text-gray-700 hover:text-indigo-400 hover:bg-indigo-950/40 transition-colors"
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                                  </svg>
                                </a>
                                {canEdit && (
                                  <button
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => handleDeleteTile(tile)}
                                    className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                                    aria-label="Remove tile"
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                            {/* Controls row — chart switcher + drag hint */}
                            {canEdit && res && (
                              <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center gap-1">
                                  {chartTypes.map((t) => (
                                    <button
                                      key={t}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={() => handleChartTypeChange(tile, t as ChartType)}
                                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                                        ct === t ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                                      }`}
                                    >
                                      {t}
                                    </button>
                                  ))}
                                </div>
                                {/* Explicit drag affordance */}
                                <div className="text-gray-700 cursor-grab" title="Drag to move">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="9" cy="7" r="1.5" /><circle cx="15" cy="7" r="1.5" />
                                    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                                    <circle cx="9" cy="17" r="1.5" /><circle cx="15" cy="17" r="1.5" />
                                  </svg>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 overflow-auto p-3 min-h-0">
                            {!res && <p className="text-xs text-gray-600">Failed to load data.</p>}

                            {res && ct !== "table" && (
                              <div className="h-full">
                                <ChartView chartType={ct} columns={res.columns} rows={res.rows} config={config} />
                              </div>
                            )}

                            {res && ct === "table" && (
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
                  </ResponsiveGridLayout>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Share modal */}
      {shareTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShareTarget(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-100">Share &ldquo;{shareTarget.name}&rdquo;</h2>
              <button onClick={() => setShareTarget(null)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
            </div>

            <p className="text-xs text-gray-500">
              Editors can change chart types and resize tiles. Paste a user&apos;s ID to grant access.
            </p>

            {/* Add editor */}
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

            {/* Editor list */}
            <div className="space-y-2">
              {editorLoading && editors.length === 0 && (
                <p className="text-xs text-gray-600">Loading…</p>
              )}
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
                    aria-label="Remove editor"
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
