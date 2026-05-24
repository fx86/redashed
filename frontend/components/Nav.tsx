"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/dashboard", label: "Dashboards" },
  { href: "/queries", label: "Queries" },
  { href: "/", label: "Query editor" },
  { href: "/connections", label: "Connections" },
];

export default function Nav() {
  const { user, signOut } = useAuth();
  const path = usePathname();

  return (
    <nav className="flex items-center h-[46px] bg-gray-900 border-b border-gray-800 px-4 gap-1 flex-shrink-0">
      <div className="w-[26px] h-[26px] bg-indigo-500 rounded-md flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
        Q
      </div>
      <span className="text-sm font-medium text-gray-100 mx-4">Querywise</span>

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

      <div className="ml-auto flex items-center gap-2">
        <a
          href="/"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
        >
          + New query
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
    </nav>
  );
}
