"use client";

import { useRef, useState } from "react";
import { searchDataGov, importDataGov } from "@/lib/api";
import type { SavedConnection, DataGovDataset } from "@/lib/api";

interface SavedConnectionBody {
  name: string;
  db_type: string;
  host: string;
  port: number;
  database: string;
  db_user: string;
  password: string;
  extra_config?: Record<string, unknown>;
}

interface Props {
  onSave: (body: SavedConnectionBody) => void;
  onCancel: () => void;
  loading: boolean;
  jwt?: string;
  onDataGovImport?: (conn: SavedConnection) => void;
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
  { id: "snowflake",  label: "Snowflake",     port: 443,   enabled: true,  icon: "❄️" },
  { id: "redshift",   label: "Redshift",      port: 5439,  enabled: false, icon: "🔴" },
  { id: "mysql",      label: "MySQL",         port: 3306,  enabled: false, icon: "🐬" },
  { id: "bigquery",   label: "BigQuery",      port: 443,   enabled: false, icon: "🔷" },
  { id: "clickhouse", label: "ClickHouse",    port: 9000,  enabled: false, icon: "🏠" },
  { id: "mssql",      label: "SQL Server",    port: 1433,  enabled: false, icon: "🪟" },
  { id: "athena",     label: "Athena",        port: 443,   enabled: false, icon: "🏺" },
  { id: "mongodb",    label: "MongoDB",       port: 27017, enabled: false, icon: "🍃" },
];

interface SnowflakeExtra {
  warehouse: string;
  role: string;
  schema_name: string;
}

type Category = "databases" | "opendata";

export default function SavedConnectionForm({ onSave, onCancel, loading, jwt, onDataGovImport }: Props) {
  const [category, setCategory] = useState<Category>("databases");
  const [selectedType, setSelectedType] = useState<DbType | null>(null);
  const [form, setForm] = useState<SavedConnectionBody>({
    name: "", db_type: "postgres", host: "localhost", port: 5432, database: "", db_user: "", password: "",
  });
  const [sfExtra, setSfExtra] = useState<SnowflakeExtra>({ warehouse: "", role: "", schema_name: "PUBLIC" });
  const [pgSchema, setPgSchema] = useState("");

  // data.gov state
  const [dgQuery, setDgQuery] = useState("");
  const [dgResults, setDgResults] = useState<DataGovDataset[]>([]);
  const [dgSearching, setDgSearching] = useState(false);
  const [dgError, setDgError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pickType(t: DbType) {
    if (!t.enabled) return;
    setSelectedType(t);
    setForm((prev) => ({ ...prev, db_type: t.id, port: t.port, host: t.id === "postgres" ? "localhost" : "" }));
  }

  function set(field: keyof SavedConnectionBody, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setSf(field: keyof SnowflakeExtra, value: string) {
    setSfExtra((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: SavedConnectionBody = { ...form };
    if (selectedType?.id === "snowflake") {
      body.extra_config = {
        warehouse: sfExtra.warehouse,
        role: sfExtra.role || undefined,
        schema_name: sfExtra.schema_name || "PUBLIC",
      };
    } else if (pgSchema.trim()) {
      body.extra_config = { schema: pgSchema.trim() };
    }
    onSave(body);
  }

  function handleDgSearch(q: string) {
    setDgQuery(q);
    setDgError(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setDgResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setDgSearching(true);
      try {
        const results = await searchDataGov(jwt ?? "", q);
        setDgResults(results);
      } catch (e) {
        setDgError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setDgSearching(false);
      }
    }, 400);
  }

  async function handleImport(dataset: DataGovDataset, resource: { id: string; name: string; url: string }) {
    if (!jwt || !onDataGovImport) return;
    setImportingId(resource.id);
    setDgError(null);
    try {
      const conn = await importDataGov(jwt, {
        dataset_id: dataset.id,
        dataset_title: dataset.title,
        resource_url: resource.url,
      });
      onDataGovImport(conn);
    } catch (e) {
      setDgError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportingId(null);
    }
  }

  // ── Credential form (database selected) ───────────────────────────────────
  if (selectedType) {
    const isSnowflake = selectedType.id === "snowflake";
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedType(null)} className="text-gray-500 hover:text-gray-300 text-sm transition-colors">←</button>
          <span className="text-lg">{selectedType.icon}</span>
          <h3 className="text-sm font-semibold">{selectedType.label}</h3>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Name" value={form.name} onChange={(v) => set("name", v)} required placeholder="My Warehouse" />

          {isSnowflake ? (
            <>
              <Field
                label="Account"
                value={form.host}
                onChange={(v) => set("host", v)}
                required
                placeholder="xyz12345.us-east-1"
                hint="Your Snowflake account identifier (without .snowflakecomputing.com)"
              />
              <Field label="Database" value={form.database} onChange={(v) => set("database", v)} required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Warehouse" value={sfExtra.warehouse} onChange={(v) => setSf("warehouse", v)} required />
                <Field label="Schema" value={sfExtra.schema_name} onChange={(v) => setSf("schema_name", v)} placeholder="PUBLIC" />
              </div>
              <Field label="Role" value={sfExtra.role} onChange={(v) => setSf("role", v)} placeholder="Optional" />
              <Field label="User" value={form.db_user} onChange={(v) => set("db_user", v)} required />
              <Field label="Password" value={form.password} onChange={(v) => set("password", v)} type="password" />
            </>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_80px] gap-3">
                <Field label="Host" value={form.host} onChange={(v) => set("host", v)} />
                <Field label="Port" value={String(form.port)} onChange={(v) => set("port", parseInt(v) || selectedType.port)} type="number" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Database" value={form.database} onChange={(v) => set("database", v)} required />
                <Field label="Schema" value={pgSchema} onChange={setPgSchema} placeholder="Optional (e.g. public)" hint="Leave blank to see all schemas" />
              </div>
              <Field label="User" value={form.db_user} onChange={(v) => set("db_user", v)} required />
              <Field label="Password" value={form.password} onChange={(v) => set("password", v)} type="password" />
            </>
          )}

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

  // ── Type picker ────────────────────────────────────────────────────────────
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">New data source</h3>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Cancel</button>
      </div>

      {/* Category toggle */}
      <div className="flex bg-gray-950 rounded-lg p-0.5 border border-gray-800 w-fit gap-0.5">
        <button
          onClick={() => setCategory("databases")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            category === "databases" ? "bg-gray-800 text-gray-100" : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Databases
        </button>
        <button
          onClick={() => setCategory("opendata")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            category === "opendata" ? "bg-gray-800 text-gray-100" : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Open data
        </button>
      </div>

      {/* Databases */}
      {category === "databases" && (
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
      )}

      {/* Open data */}
      {category === "opendata" && (
        <div className="space-y-3">
          {/* data.gov */}
          <div className="border border-gray-700 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-100">data.gov</span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800 rounded px-1 leading-4">GOV</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">300,000+ US government datasets — no account needed</p>
              </div>
            </div>

            <input
              type="text"
              value={dgQuery}
              onChange={(e) => handleDgSearch(e.target.value)}
              placeholder="Search datasets (e.g. unemployment, climate, census…)"
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-emerald-600 transition-colors"
              autoFocus
            />

            {dgError && <p className="text-xs text-red-400">{dgError}</p>}
            {dgSearching && <p className="text-xs text-gray-500">Searching…</p>}

            {dgResults.length > 0 && (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {dgResults.map((dataset) => (
                  <div key={dataset.id} className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-2">
                    <div>
                      <p className="text-sm font-medium text-gray-100 leading-tight">{dataset.title}</p>
                      {dataset.organization && (
                        <p className="text-[11px] text-gray-500 mt-0.5">{dataset.organization}</p>
                      )}
                      {dataset.notes && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{dataset.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {dataset.resources.map((res) => (
                        <div key={res.id} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-500 truncate">{res.name}</span>
                          <button
                            onClick={() => handleImport(dataset, res)}
                            disabled={importingId !== null || !jwt || !onDataGovImport}
                            className="text-[11px] px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                          >
                            {importingId === res.id ? "Importing…" : "Import"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!dgSearching && dgQuery && dgResults.length === 0 && (
              <p className="text-xs text-gray-500">No CSV datasets found for "{dgQuery}".</p>
            )}
          </div>

          {/* Future: World Bank */}
          <div className="border border-gray-800 rounded-lg p-4 opacity-40 cursor-not-allowed">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400">World Bank</span>
              <span className="text-[10px] text-gray-600 border border-gray-700 rounded px-1 leading-4">Coming soon</span>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">Global development indicators</p>
          </div>

          {/* Future: India open data */}
          <div className="border border-gray-800 rounded-lg p-4 opacity-40 cursor-not-allowed">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400">data.gov.in</span>
              <span className="text-[10px] text-gray-600 border border-gray-700 rounded px-1 leading-4">Coming soon</span>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">India government open datasets</p>
          </div>
        </div>
      )}
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
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
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
      {hint && <p className="text-[11px] text-gray-600">{hint}</p>}
    </div>
  );
}
