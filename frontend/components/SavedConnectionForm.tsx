"use client";

import { useState } from "react";

interface SavedConnectionBody {
  name: string;
  host: string;
  port: number;
  database: string;
  db_user: string;
  password: string;
}

interface Props {
  onSave: (body: SavedConnectionBody) => void;
  onCancel: () => void;
  loading: boolean;
}

interface DbType {
  id: string;
  label: string;
  port: number;
  enabled: boolean;
  icon: string;
}

const DB_TYPES: DbType[] = [
  { id: "postgres",   label: "PostgreSQL",    port: 5432,  enabled: true,  icon: "🐘" },
  { id: "redshift",   label: "Redshift",      port: 5439,  enabled: false, icon: "🔴" },
  { id: "mysql",      label: "MySQL",         port: 3306,  enabled: false, icon: "🐬" },
  { id: "bigquery",   label: "BigQuery",      port: 443,   enabled: false, icon: "🔷" },
  { id: "snowflake",  label: "Snowflake",     port: 443,   enabled: false, icon: "❄️" },
  { id: "clickhouse", label: "ClickHouse",    port: 9000,  enabled: false, icon: "🏠" },
  { id: "mssql",      label: "SQL Server",    port: 1433,  enabled: false, icon: "🪟" },
  { id: "athena",     label: "Athena",        port: 443,   enabled: false, icon: "🏺" },
  { id: "mongodb",    label: "MongoDB",       port: 27017, enabled: false, icon: "🍃" },
];

export default function SavedConnectionForm({ onSave, onCancel, loading }: Props) {
  const [selectedType, setSelectedType] = useState<DbType | null>(null);
  const [form, setForm] = useState<SavedConnectionBody>({
    name: "", host: "localhost", port: 5432, database: "", db_user: "", password: "",
  });

  function pickType(t: DbType) {
    if (!t.enabled) return;
    setSelectedType(t);
    setForm((prev) => ({ ...prev, port: t.port }));
  }

  function set(field: keyof SavedConnectionBody, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  if (!selectedType) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">New Data Source</h3>
          <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-300 underline">Cancel</button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {DB_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => pickType(t)}
              disabled={!t.enabled}
              title={t.enabled ? undefined : "Coming soon"}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-colors ${
                t.enabled
                  ? "border-gray-700 hover:border-indigo-500 hover:bg-gray-800 cursor-pointer"
                  : "border-gray-800 opacity-30 cursor-not-allowed"
              }`}
            >
              <span className="text-2xl">{t.icon}</span>
              <span className="text-xs text-gray-300 leading-tight">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setSelectedType(null)} className="text-gray-500 hover:text-gray-300 text-sm transition-colors">←</button>
        <span className="text-lg">{selectedType.icon}</span>
        <h3 className="text-sm font-semibold">{selectedType.label}</h3>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name" value={form.name} onChange={(v) => set("name", v)} required placeholder="My Warehouse" />
        <div className="grid grid-cols-[1fr_80px] gap-3">
          <Field label="Host" value={form.host} onChange={(v) => set("host", v)} />
          <Field label="Port" value={String(form.port)} onChange={(v) => set("port", parseInt(v) || selectedType.port)} type="number" />
        </div>
        <Field label="Database" value={form.database} onChange={(v) => set("database", v)} required />
        <Field label="User" value={form.db_user} onChange={(v) => set("db_user", v)} required />
        <Field label="Password" value={form.password} onChange={(v) => set("password", v)} type="password" />
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={loading} className="flex-1 h-9 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition-colors">
            {loading ? "Testing & Saving…" : "Test & Save"}
          </button>
          <button type="button" onClick={onCancel} className="h-9 px-4 rounded border border-gray-700 hover:border-gray-500 text-sm text-gray-400 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-gray-600"
      />
    </div>
  );
}
