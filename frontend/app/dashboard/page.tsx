"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  listDashboards,
  listDashboardTiles,
  deleteDashboard,
  deleteDashboardTile,
  runSql,
} from "@/lib/api";
import type { Dashboard, DashboardTile, QueryResponse } from "@/lib/api";
import { selectChartType } from "@bi-tool/charts";
import type { ChartType } from "@bi-tool/charts";
import ChartView from "@/components/ChartView";
import Nav from "@/components/Nav";

export default function DashboardPage() {
  const { user, session, loading: authLoading } = useAuth();
  const jwt = session?.access_token ?? "";

  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [activeDashboard, setActiveDashboard] = useState<Dashboard | null>(null);
  const [tiles, setTiles] = useState<DashboardTile[]>([]);
  const [results, setResults] = useState<Record<string, QueryResponse>>({});
  const [chartTypes, setChartTypes] = useState<Record<string, ChartType>>({});
  const [loading, setLoading] = useState(false);

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
      const types: Record<string, ChartType> = {};
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
            types[tile.id] = (tile.chart_type as ChartType) ||
              selectChartType(r.columns, rows).type;
          } catch {
            // tile fails silently — show placeholder
          }
        })
      );
      setResults(res);
      setChartTypes(types);
    } finally {
      setLoading(false);
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

  if (authLoading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading…</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm">
          <a href="/" className="underline hover:text-gray-300">Sign in</a> to view dashboards.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Nav />
      <div className="flex-1 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
          {/* Sidebar */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">My Dashboards</p>
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
                <span className="text-sm truncate">{d.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteDashboard(d); }}
                  className="text-gray-600 hover:text-red-400 text-xs ml-2 flex-shrink-0 transition-colors"
                  aria-label="Delete dashboard"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Tile grid */}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tiles.map((tile) => {
                  const res = results[tile.id];
                  const ct = chartTypes[tile.id] ?? "table";
                  const config = tile.chart_config as { x?: string; y?: string };
                  return (
                    <div
                      key={tile.id}
                      className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-200 font-medium">{tile.question}</p>
                        <button
                          onClick={() => handleDeleteTile(tile)}
                          className="text-gray-600 hover:text-red-400 text-xs flex-shrink-0 transition-colors"
                          aria-label="Remove tile"
                        >
                          ✕
                        </button>
                      </div>

                      {res && ct !== "table" && (
                        <div className="flex gap-1">
                          {(["bar", "line", "scatter", "table"] as ChartType[]).map((t) => (
                            <button
                              key={t}
                              onClick={() => setChartTypes((prev) => ({ ...prev, [tile.id]: t }))}
                              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                                ct === t ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}

                      {!res && <p className="text-xs text-gray-600">Failed to load data.</p>}

                      {res && ct !== "table" && (
                        <ChartView chartType={ct} columns={res.columns} rows={res.rows} x={config.x} y={config.y} />
                      )}

                      {res && ct === "table" && (
                        <div className="overflow-x-auto">
                          <table className="text-xs w-full">
                            <thead>
                              <tr>
                                {res.columns.map((c) => (
                                  <th key={c} className="text-left text-gray-500 pb-1 pr-3 font-medium">{c}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {res.rows.slice(0, 10).map((row, i) => (
                                <tr key={i} className="border-t border-gray-800">
                                  {row.map((cell, j) => (
                                    <td key={j} className="py-1 pr-3 text-gray-300">{String(cell ?? "")}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {res.row_count > 10 && (
                            <p className="text-xs text-gray-600 mt-1">+{res.row_count - 10} more rows</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </main>
  );
}
