"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import Nav from "@/components/Nav";
import {
  listAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
  runAlertNow,
  testTelegram,
  listSavedQueries,
} from "@/lib/api";
import type { Alert, AlertCreate, SavedQuery } from "@/lib/api";

type ConditionType = "row_count_above" | "row_count_below" | "query_failure";

const CONDITION_LABELS: Record<ConditionType, string> = {
  row_count_above: "Row count exceeds",
  row_count_below: "Row count falls below",
  query_failure: "Query fails",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AlertsPage() {
  const { session } = useAuth();
  const jwt = session?.access_token ?? "";

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Alert | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!jwt) return;
    Promise.all([listAlerts(jwt), listSavedQueries(jwt)])
      .then(([a, q]) => { setAlerts(a); setQueries(q); })
      .finally(() => setLoading(false));
  }, [jwt]);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }

  async function handleToggle(alert: Alert) {
    const updated = await updateAlert(jwt, alert.id, { is_active: !alert.is_active });
    setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  async function handleDelete(alert: Alert) {
    await deleteAlert(jwt, alert.id);
    setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    setDeleteTarget(null);
    showToast("Alert deleted");
  }

  async function handleRunNow(alert: Alert) {
    setRunningId(alert.id);
    try {
      const updated = await runAlertNow(jwt, alert.id);
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      showToast("Alert evaluated — check Telegram if it fired");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setRunningId(null);
    }
  }

  async function handleCreate(data: AlertCreate) {
    const created = await createAlert(jwt, data);
    setAlerts((prev) => [created, ...prev]);
    setShowForm(false);
    showToast("Alert created");
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Nav />

      <div className="max-w-[860px] mx-auto w-full px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-100">Alerts</h1>
            <p className="text-xs text-gray-500 mt-0.5">Monitor your queries and get notified on Telegram</p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors"
            >
              + New alert
            </button>
          )}
        </div>

        {/* Create form */}
        {showForm && (
          <AlertForm
            jwt={jwt}
            queries={queries}
            onSave={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* List */}
        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : alerts.length === 0 && !showForm ? (
          <EmptyState onNew={() => setShowForm(true)} />
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                running={runningId === alert.id}
                onToggle={() => handleToggle(alert)}
                onRunNow={() => handleRunNow(alert)}
                onDelete={() => setDeleteTarget(alert)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-full max-w-sm space-y-4">
            <p className="text-sm text-gray-200">
              Delete <span className="font-medium">"{deleteTarget.name}"</span>?
            </p>
            <p className="text-xs text-gray-500">This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div
        className={`fixed bottom-4 right-4 z-50 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 shadow-xl transition-all duration-300 ${
          toastMsg ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        }`}
      >
        {toastMsg}
      </div>
    </main>
  );
}

// ── Alert row ──────────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  running,
  onToggle,
  onRunNow,
  onDelete,
}: {
  alert: Alert;
  running: boolean;
  onToggle: () => void;
  onRunNow: () => void;
  onDelete: () => void;
}) {
  const condLabel = CONDITION_LABELS[alert.condition_type];
  const condDetail =
    alert.condition_type === "query_failure"
      ? ""
      : ` ${alert.threshold} rows`;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-start gap-3">
      {/* Toggle */}
      <button
        onClick={onToggle}
        title={alert.is_active ? "Pause alert" : "Resume alert"}
        className={`mt-0.5 flex-shrink-0 w-8 h-4 rounded-full transition-colors relative ${
          alert.is_active ? "bg-indigo-600" : "bg-gray-700"
        }`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${
            alert.is_active ? "left-4" : "left-0.5"
          }`}
        />
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-100">{alert.name}</p>
          {!alert.is_active && (
            <span className="text-[10px] bg-gray-800 border border-gray-700 text-gray-500 rounded px-1.5 leading-4">
              paused
            </span>
          )}
          {alert.last_fired_at && (
            <span className="text-[10px] bg-orange-950/40 border border-orange-900 text-orange-400 rounded px-1.5 leading-4">
              fired {timeAgo(alert.last_fired_at)}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">
          {condLabel}{condDetail} · checked {timeAgo(alert.last_checked_at)}
        </p>
        <p className="text-[11px] text-gray-700 font-mono truncate max-w-[480px]">{alert.sql}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onRunNow}
          disabled={running}
          title="Evaluate now"
          className="text-xs px-2.5 py-1 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 disabled:opacity-40 transition-colors"
        >
          {running ? "…" : "Run now"}
        </button>
        <button
          onClick={onDelete}
          title="Delete alert"
          className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-950/30 transition-colors"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

// ── Create form ────────────────────────────────────────────────────────────────

function AlertForm({
  jwt,
  queries,
  onSave,
  onCancel,
}: {
  jwt: string;
  queries: SavedQuery[];
  onSave: (data: AlertCreate) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [selectedQueryId, setSelectedQueryId] = useState(queries[0]?.id ?? "");
  const [condition, setCondition] = useState<ConditionType>("row_count_above");
  const [threshold, setThreshold] = useState(0);
  const [chatId, setChatId] = useState("");
  const [botToken, setBotToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  const selectedQuery = queries.find((q) => q.id === selectedQueryId);

  async function handleTest() {
    if (!botToken || !chatId) return;
    setTesting(true);
    setTestResult(null);
    try {
      await testTelegram(jwt, botToken, chatId);
      setTestResult({ ok: true, msg: "Message sent! Check your Telegram." });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : "Failed" });
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedQuery) { setError("Select a query"); return; }
    if (!name.trim()) { setError("Name is required"); return; }
    if (!chatId.trim() || !botToken.trim()) { setError("Telegram credentials are required"); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        saved_query_id: selectedQuery.id,
        connection_id: selectedQuery.connection_id ?? "",
        sql: selectedQuery.sql,
        condition_type: condition,
        threshold: condition === "query_failure" ? 0 : threshold,
        telegram_chat_id: chatId.trim(),
        telegram_bot_token: botToken.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create alert");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4"
    >
      <h2 className="text-sm font-semibold text-gray-200">New alert</h2>

      {/* Name */}
      <div className="space-y-1">
        <label className="text-xs text-gray-400">Alert name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Daily order count"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Query picker */}
      <div className="space-y-1">
        <label className="text-xs text-gray-400">Query to monitor</label>
        {queries.length === 0 ? (
          <p className="text-xs text-gray-500">
            No saved queries yet.{" "}
            <a href="/" className="text-indigo-400 hover:underline">
              Save a query first.
            </a>
          </p>
        ) : (
          <select
            value={selectedQueryId}
            onChange={(e) => setSelectedQueryId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
          >
            {queries.map((q) => (
              <option key={q.id} value={q.id}>
                {q.question}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Condition */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400">Condition</label>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(CONDITION_LABELS) as ConditionType[]).map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setCondition(c)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                condition === c
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
            >
              {CONDITION_LABELS[c]}
            </button>
          ))}
        </div>
        {condition !== "query_failure" && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Threshold (rows)</label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              min={0}
              className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}
      </div>

      {/* Telegram */}
      <div className="space-y-3 border-t border-gray-800 pt-4">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400 font-medium">Telegram notification</label>
          <button
            type="button"
            onClick={() => setShowSetup((v) => !v)}
            className="text-[11px] text-indigo-400 hover:text-indigo-300"
          >
            {showSetup ? "Hide setup guide" : "How to set this up ↓"}
          </button>
        </div>

        {showSetup && (
          <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-1.5 text-xs text-gray-400">
            <p className="font-medium text-gray-300">Setup guide</p>
            <p>1. Open Telegram and message <span className="text-gray-200">@BotFather</span></p>
            <p>2. Send <code className="text-indigo-300 bg-gray-900 px-1 rounded">/newbot</code> and follow the prompts to create a bot</p>
            <p>3. Copy the <span className="text-gray-200">bot token</span> BotFather gives you</p>
            <p>4. Start a chat with your new bot (click the link BotFather provides)</p>
            <p>5. Send any message to your bot</p>
            <p>6. Get your chat ID by messaging <span className="text-gray-200">@userinfobot</span> or visiting:</p>
            <code className="block text-[10px] text-indigo-300 bg-gray-900 px-2 py-1 rounded break-all">
              https://api.telegram.org/bot&#123;YOUR_TOKEN&#125;/getUpdates
            </code>
            <p>Look for <code className="text-indigo-300">message.chat.id</code> in the response</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Bot token</label>
            <input
              value={botToken}
              onChange={(e) => { setBotToken(e.target.value); setTestResult(null); }}
              placeholder="123456:ABC-DEF..."
              type="password"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Chat ID</label>
            <input
              value={chatId}
              onChange={(e) => { setChatId(e.target.value); setTestResult(null); }}
              placeholder="-1001234567890"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !botToken || !chatId}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 transition-colors"
          >
            {testing ? "Sending…" : "Send test message"}
          </button>
          {testResult && (
            <span className={`text-xs ${testResult.ok ? "text-emerald-400" : "text-red-400"}`}>
              {testResult.msg}
            </span>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || queries.length === 0}
          className="text-xs px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {saving ? "Creating…" : "Create alert"}
        </button>
      </div>
    </form>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="border border-dashed border-gray-800 rounded-xl px-6 py-12 text-center space-y-3">
      <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center mx-auto">
        <BellIcon />
      </div>
      <p className="text-sm text-gray-400">No alerts yet</p>
      <p className="text-xs text-gray-600 max-w-xs mx-auto">
        Monitor a saved query and get notified on Telegram when row counts cross a threshold or a query fails.
      </p>
      <button
        onClick={onNew}
        className="text-xs px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors"
      >
        Create your first alert
      </button>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-500">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}
