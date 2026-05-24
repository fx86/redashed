"use client";

import type { QueryResponse } from "@/lib/api";

interface Props {
  result: QueryResponse;
}

export default function ResultsTable({ result }: Props) {
  return (
    <div className="space-y-3">
      <div className="bg-gray-900 border border-gray-800 rounded p-3">
        <p className="text-xs text-gray-500 mb-1">Generated SQL</p>
        <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">{result.sql}</pre>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{result.row_count} row{result.row_count !== 1 ? "s" : ""}</p>
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
                  <td key={j} className="px-3 py-2 text-gray-300 whitespace-nowrap max-w-xs truncate">
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
