"use client";

import { useState } from "react";
import type { ConnectionParams } from "@/lib/api";

interface Props {
  onConnect: (params: ConnectionParams) => void;
  loading: boolean;
  error: string | null;
}

export default function ConnectionForm({ onConnect, loading, error }: Props) {
  const [form, setForm] = useState<ConnectionParams>({
    host: "localhost",
    port: 5432,
    database: "",
    user: "",
    password: "",
  });

  function set(field: keyof ConnectionParams, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConnect(form);
  }

  return (
    <div className="max-w-md mx-auto mt-16">
      <h2 className="text-lg font-medium mb-6">Connect to PostgreSQL</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-[1fr_80px] gap-3">
          <Field label="Host" value={form.host} onChange={(v) => set("host", v)} />
          <Field
            label="Port"
            value={String(form.port)}
            onChange={(v) => set("port", parseInt(v) || 5432)}
            type="number"
          />
        </div>
        <Field label="Database" value={form.database} onChange={(v) => set("database", v)} required />
        <Field label="User" value={form.user} onChange={(v) => set("user", v)} required />
        <Field label="Password" value={form.password} onChange={(v) => set("password", v)} type="password" />

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded p-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition-colors"
        >
          {loading ? "Connecting…" : "Connect"}
        </button>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
      />
    </div>
  );
}
