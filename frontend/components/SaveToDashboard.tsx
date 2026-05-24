"use client";

import { useState } from "react";
import { listDashboards, createDashboard, createDashboardTile, saveQuery, listSavedQueries } from "@/lib/api";
import type { Dashboard } from "@/lib/api";
import type { ChartType, ChartConfig } from "@bi-tool/charts";

interface Props {
  jwt: string;
  connectionId: string;
  question: string;
  sql: string;
  chartType: ChartType;
  chartConfig: ChartConfig;
  onSaved: () => void;
  onCancel: () => void;
}

export default function SaveToDashboard({
  jwt, connectionId, question, sql, chartType, chartConfig, onSaved, onCancel,
}: Props) {
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setDashboards(await listDashboards(jwt));
    } catch {
      setError("Failed to load dashboards");
    }
  }

  if (dashboards === null && !loading) { load(); }

  async function saveTo(dashboardId: string) {
    setLoading(true);
    try {
      await createDashboardTile(jwt, dashboardId, {
        connection_id: connectionId,
        question,
        sql,
        chart_type: chartType,
        chart_config: (chartConfig as unknown) as Record<string, string>,
        position: 0,
      });
      const existing = await listSavedQueries(jwt);
      const alreadySaved = existing.some(
        (q) => q.question === question && q.connection_id === connectionId
      );
      if (!alreadySaved) {
        await saveQuery(jwt, { connection_id: connectionId, question, sql });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const d = await createDashboard(jwt, newName.trim());
      await saveTo(d.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create dashboard");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-100">Save to Dashboard</h2>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {dashboards === null ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : (
          <div className="space-y-2">
            {dashboards.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-gray-400">Existing dashboards</p>
                {dashboards.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => saveTo(d.id)}
                    disabled={loading}
                    className="w-full text-left text-sm px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}

            <div className="pt-2 space-y-2">
              <p className="text-xs text-gray-400">New dashboard</p>
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="Dashboard name"
                  className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600"
                />
                <button
                  onClick={handleCreate}
                  disabled={loading || !newName.trim()}
                  className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm transition-colors"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onCancel}
          className="text-xs text-gray-500 hover:text-gray-300 underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
