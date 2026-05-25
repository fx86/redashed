"use client";

import { useState } from "react";
import type { QueryResponse } from "@/lib/api";

interface Props {
  result: QueryResponse;
}

function isNumericCell(value: unknown): boolean {
  if (value === null || value === undefined || String(value).trim() === "") return false;
  return !isNaN(Number(value));
}

export default function ResultsTable({ result }: Props) {
  const [showSql, setShowSql] = useState(false);

  return (
    <div className="space-y-2">
      <div className="bg-gray-900 border border-gray-800 rounded">
        <button
          onClick={() => setShowSql((v) => !v)}
          className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-gray-500 hover:text-gray-400 transition-colors"
        >
          <span className="text-[10px] text-gray-700">{showSql ? "▾" : "▸"}</span>
          Generated SQL
        </button>
        {showSql && (
          <pre className="px-3 pb-3 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap border-t border-gray-800/60">{result.sql}</pre>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {result.row_count} row{result.row_count !== 1 ? "s" : ""}
          {result.execution_time_ms > 0 && (
            <span className="ml-2 text-gray-700">· {result.execution_time_ms}ms</span>
          )}
        </p>
      </div>

      <div className="overflow-x-auto rounded border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wider">
            <tr>
              {result.columns.map((col) => (
                <th key={col} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {result.rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-900/50">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2 text-gray-300 whitespace-nowrap max-w-xs truncate ${isNumericCell(cell) ? "text-right tabular-nums" : ""}`}
                  >
                    {cell === null ? <span className="text-gray-600 italic">null</span> : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
