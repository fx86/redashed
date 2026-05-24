"use client";

import { useState } from "react";
import { useVoiceInput } from "@/lib/useVoiceInput";

interface Props {
  onQuery: (question: string) => void;
  loading: boolean;
}

export default function QueryInput({ onQuery, loading }: Props) {
  const [question, setQuestion] = useState("");

  const { listening, supported, toggle } = useVoiceInput((t) =>
    setQuestion((prev) => (prev.trim() ? `${prev} ${t}` : t))
  );

  function submit() {
    if (question.trim()) onQuery(question.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="bg-gray-900 border border-indigo-500/30 rounded-xl ring-1 ring-indigo-500/10 focus-within:border-indigo-500/60 focus-within:ring-indigo-500/20 transition-all">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything about your data…"
        rows={3}
        className="w-full bg-transparent px-4 pt-3 pb-2 text-sm text-gray-100 resize-none focus:outline-none placeholder:text-gray-600"
      />
      <div className="flex items-center justify-between px-3 pb-3 pt-1 border-t border-gray-800/60">
        <div className="flex items-center gap-2">
          {supported && (
            <button
              type="button"
              onClick={toggle}
              title={listening ? "Stop recording" : "Speak your question"}
              className={`p-1.5 rounded-md transition-colors ${
                listening
                  ? "text-red-400 bg-red-950/30 animate-pulse"
                  : "text-gray-600 hover:text-gray-400 hover:bg-gray-800"
              }`}
            >
              <MicIcon />
            </button>
          )}
          <span className="text-[11px] text-gray-700">Shift+Enter for newline</span>
        </div>
        <button
          onClick={submit}
          disabled={loading || !question.trim()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white transition-colors"
        >
          {loading ? "Running…" : "Run"}
          {!loading && <span className="text-[10px] text-indigo-300 font-normal">⌘↵</span>}
        </button>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
