"use client";

import { useState } from "react";
import type { TableInfo } from "@/lib/api";

interface Props {
  tables: TableInfo[];
}

export default function SchemaPanel({ tables }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <aside className="bg-gray-900 border border-gray-800 rounded p-3 overflow-y-auto max-h-[calc(100vh-160px)]">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
        {tables.length} table{tables.length !== 1 ? "s" : ""}
      </p>
      <ul className="space-y-1">
        {tables.map((t) => {
          const key = `${t.schema}.${t.name}`;
          const open = expanded.has(key);
          return (
            <li key={key}>
              <button
                onClick={() => toggle(key)}
                className="w-full text-left text-sm py-1 px-2 rounded hover:bg-gray-800 flex items-center gap-1"
              >
                <span className="text-gray-500 text-xs">{open ? "▾" : "▸"}</span>
                <span className="text-gray-200 truncate">{t.name}</span>
                <span className="text-gray-600 text-xs ml-1">{t.schema}</span>
              </button>
              {open && (
                <ul className="ml-5 mt-1 space-y-0.5">
                  {t.columns.map((c) => (
                    <li key={c.name} className="text-xs text-gray-400 py-0.5 flex gap-2">
                      <span className="text-gray-300">{c.name}</span>
                      <span className="text-gray-600">{c.type}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
