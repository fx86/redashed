"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/dashboard", label: "Dashboards" },
  { href: "/queries", label: "Queries" },
  { href: "/alerts", label: "Alerts" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const { user, signOut } = useAuth();
  const path = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function isActive(href: string) {
    if (href === "/dashboard") return path === "/dashboard" || path.startsWith("/dashboard/");
    return path === href;
  }

  // Close avatar dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function onMouse(e: MouseEvent) {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onMouse);
    return () => document.removeEventListener("mousedown", onMouse);
  }, [dropdownOpen]);

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false); }, [path]);

  return (
    <nav className="relative bg-gray-900 border-b border-gray-800 flex-shrink-0 z-30">
      <div className="max-w-[1080px] mx-auto flex items-center h-[46px] px-4 gap-1">

        {/* Logo */}
        <a href="/" className="flex items-center gap-2 mr-3 hover:opacity-80 transition-opacity flex-shrink-0">
          <div className="w-6 h-6 bg-indigo-500 rounded-md flex items-center justify-center text-white text-[11px] font-bold">
            Q
          </div>
          <span className="text-sm font-semibold text-gray-100 hidden sm:block tracking-tight">Querywise</span>
        </a>

        {/* Desktop nav links */}
        <a
          href="/"
          className={`hidden sm:flex px-2.5 h-[46px] items-center text-xs border-b-2 transition-colors whitespace-nowrap ${
            path === "/"
              ? "text-gray-100 font-medium border-indigo-500"
              : "text-gray-400 hover:text-gray-100 border-transparent"
          }`}
        >
          New query
        </a>

        {links.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            className={`hidden sm:flex px-2.5 h-[46px] items-center text-xs border-b-2 transition-colors whitespace-nowrap ${
              isActive(href)
                ? "text-gray-100 font-medium border-indigo-500"
                : "text-gray-400 hover:text-gray-100 border-transparent"
            }`}
          >
            {label}
          </a>
        ))}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-1.5">

          {/* Desktop: connections icon */}
          <a
            href="/connections"
            title="Connections"
            className={`hidden sm:flex w-[30px] h-[30px] rounded-md items-center justify-center transition-colors ${
              path === "/connections"
                ? "text-gray-200 bg-gray-800"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
            }`}
          >
            <ConnectionsIcon />
          </a>

          {/* Avatar + dropdown */}
          {user && (
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="w-[26px] h-[26px] bg-indigo-500 rounded-full flex items-center justify-center text-white text-[10px] font-medium hover:bg-indigo-400 transition-colors"
                title={user.email ?? ""}
              >
                {user.email?.[0]?.toUpperCase() ?? "?"}
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-800">
                    <p className="text-[11px] text-gray-500 truncate">{user.email}</p>
                  </div>
                  <a
                    href="/settings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors"
                  >
                    Settings
                  </a>
                  <button
                    onClick={() => { setDropdownOpen(false); signOut(); }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile: hamburger */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="sm:hidden flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden border-t border-gray-800 bg-gray-900 py-1.5">
          <div className="max-w-[1080px] mx-auto px-4 flex flex-col gap-0.5">
            <MobileLink href="/" label="New query" active={path === "/"} onClick={() => setMenuOpen(false)} />
            {links.map(({ href, label }) => (
              <MobileLink key={href} href={href} label={label} active={isActive(href)} onClick={() => setMenuOpen(false)} />
            ))}
            <MobileLink href="/connections" label="Connections" active={path === "/connections"} onClick={() => setMenuOpen(false)} />
          </div>
        </div>
      )}
    </nav>
  );
}

function MobileLink({ href, label, active, onClick }: { href: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={`px-3 py-2.5 rounded-lg text-sm transition-colors ${
        active
          ? "bg-indigo-600/20 text-indigo-300 font-medium"
          : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
      }`}
    >
      {label}
    </a>
  );
}

function ConnectionsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
