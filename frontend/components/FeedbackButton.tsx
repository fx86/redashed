"use client";

const FORM_URL = process.env.NEXT_PUBLIC_FEEDBACK_FORM_URL ?? "";

export default function FeedbackButton() {
  if (!FORM_URL) return null;

  return (
    <a
      href={FORM_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Share feedback"
      className="fixed bottom-5 right-5 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full bg-gray-800 border border-gray-700 text-xs text-gray-400 hover:text-gray-100 hover:border-gray-500 shadow-lg transition-all hover:shadow-indigo-900/20 hover:shadow-xl"
    >
      <ChatIcon />
      Feedback
    </a>
  );
}

function ChatIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
