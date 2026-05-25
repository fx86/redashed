"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/", label: "New query" },
  { href: "/dashboard", label: "Dashboards" },
  { href: "/queries", label: "Queries" },
];

export default function Nav() {
  const { user, signOut } = useAuth();
  const path = usePathname();

  return (
    <nav className="bg-gray-900 border-b border-gray-800 flex-shrink-0">
      <div className="max-w-[1080px] mx-auto flex items-center h-[46px] px-4 gap-1">
        <a
          href="/"
          className="w-[26px] h-[26px] bg-indigo-500 rounded-md flex items-center justify-center text-white text-xs font-medium flex-shrink-0 hover:bg-indigo-400 transition-colors mr-2"
        >
          Q
        </a>

        {links.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            className={`px-2.5 h-[46px] flex items-center text-xs border-b-2 transition-colors whitespace-nowrap ${
              path === href
                ? "text-gray-100 font-medium border-indigo-500"
                : "text-gray-400 hover:text-gray-100 border-transparent"
            }`}
          >
            {label}
          </a>
        ))}

        <div className="ml-auto flex items-center gap-1.5">
          <a
            href="/connections"
            title="Connections & Settings"
            className={`w-[30px] h-[30px] rounded-md flex items-center justify-center transition-colors ${
              path === "/connections"
                ? "text-gray-200 bg-gray-800"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </a>

          {user && (
            <button
              onClick={signOut}
              title={`Sign out (${user.email})`}
              className="w-[26px] h-[26px] bg-indigo-500 rounded-full flex items-center justify-center text-white text-[10px] font-medium hover:bg-indigo-400 transition-colors"
            >
              {user.email?.[0]?.toUpperCase() ?? "?"}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
