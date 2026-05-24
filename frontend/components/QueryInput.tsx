"use client";

import { useState } from "react";

interface Props {
  onQuery: (question: string) => void;
  loading: boolean;
}

export default function QueryInput({ onQuery, loading }: Props) {
  const [question, setQuestion] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim()) onQuery(question.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (question.trim()) onQuery(question.trim());
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question about your data… (Enter to run, Shift+Enter for newline)"
        rows={2}
        className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-500 placeholder:text-gray-600"
      />
      <button
        type="submit"
        disabled={loading || !question.trim()}
        className="px-4 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition-colors self-end h-10"
      >
        {loading ? "…" : "Run"}
      </button>
    </form>
  );
}
