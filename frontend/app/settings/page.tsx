"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getAiKeyStatus, upsertAiKey, deleteAiKey } from "@/lib/api";
import type { AiKeyStatus } from "@/lib/api";
import Nav from "@/components/Nav";

const PROVIDERS = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "openai", label: "OpenAI" },
  { value: "openrouter", label: "OpenRouter" },
] as const;

const PROVIDER_MODELS: Record<string, string[]> = {
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  openrouter: [
    "openai/gpt-4o",
    "anthropic/claude-3-5-sonnet-20241022",
    "meta-llama/llama-3.1-8b-instruct:free",
  ],
};

export default function SettingsPage() {
  const { user, session, loading: authLoading, updateDisplayName, updatePassword } = useAuth();
  const jwt = session?.access_token ?? "";
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const isGoogleUser = user?.app_metadata?.provider === "google";

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Password state
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // AI key state
  const [keyStatus, setKeyStatus] = useState<AiKeyStatus | null>(null);
  const [provider, setProvider] = useState<string>("deepseek");
  const [model, setModel] = useState<string>("deepseek-chat");
  const [apiKey, setApiKey] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [keyMsg, setKeyMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !authLoading && !user) router.replace("/");
  }, [mounted, authLoading, user, router]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "");
    }
  }, [user]);

  useEffect(() => {
    if (!jwt) return;
    getAiKeyStatus(jwt).then(setKeyStatus).catch(() => {});
  }, [jwt]);

  function handleProviderChange(p: string) {
    setProvider(p);
    setModel(PROVIDER_MODELS[p][0]);
    setKeyMsg(null);
  }

  async function handleSaveName() {
    if (!displayName.trim()) return;
    setNameSaving(true);
    setNameMsg(null);
    try {
      await updateDisplayName(displayName.trim());
      setNameMsg({ type: "ok", text: "Name updated." });
    } catch (e) {
      setNameMsg({ type: "err", text: e instanceof Error ? e.message : "Failed to update name" });
    } finally {
      setNameSaving(false);
    }
  }

  async function handleSavePassword() {
    if (newPassword.length < 8) {
      setPwMsg({ type: "err", text: "Password must be at least 8 characters." });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    try {
      await updatePassword(newPassword);
      setNewPassword("");
      setPwMsg({ type: "ok", text: "Password updated." });
    } catch (e) {
      setPwMsg({ type: "err", text: e instanceof Error ? e.message : "Failed to update password" });
    } finally {
      setPwSaving(false);
    }
  }

  async function handleSaveKey() {
    if (!apiKey.trim()) {
      setKeyMsg({ type: "err", text: "Enter an API key." });
      return;
    }
    setKeySaving(true);
    setKeyMsg(null);
    try {
      const status = await upsertAiKey(jwt, provider, model, apiKey.trim());
      setKeyStatus(status);
      setApiKey("");
      setKeyMsg({ type: "ok", text: "Key saved and verified." });
    } catch (e) {
      setKeyMsg({ type: "err", text: e instanceof Error ? e.message : "Key test failed" });
    } finally {
      setKeySaving(false);
    }
  }

  async function handleRemoveKey() {
    await deleteAiKey(jwt);
    setKeyStatus({ has_key: false, provider: null, model: null });
    setRemoveConfirm(false);
    setKeyMsg(null);
  }

  if (!mounted || authLoading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <span className="text-gray-500 text-sm">Loading…</span>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <Nav />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-base font-semibold text-gray-100">Settings</h1>

        {/* ── Profile ── */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
          <h2 className="text-sm font-semibold text-gray-200">Profile</h2>

          {/* Display name */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400">Display name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setNameMsg(null); }}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="Your name"
              />
              <button
                onClick={handleSaveName}
                disabled={nameSaving || !displayName.trim()}
                className="text-xs px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {nameSaving ? "Saving…" : "Save"}
              </button>
            </div>
            {nameMsg && (
              <p className={`text-xs ${nameMsg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                {nameMsg.text}
              </p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400">Email</label>
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-300">{user.email}</p>
              {isGoogleUser && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-500">
                  Google account
                </span>
              )}
            </div>
          </div>

          {/* Password — only for email+password users */}
          {!isGoogleUser && (
            <div className="space-y-1.5 pt-1 border-t border-gray-800">
              <label className="text-xs text-gray-400 block pt-4">New password</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPwMsg(null); }}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
                <button
                  onClick={handleSavePassword}
                  disabled={pwSaving || newPassword.length < 8}
                  className="text-xs px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {pwSaving ? "Saving…" : "Update"}
                </button>
              </div>
              {pwMsg && (
                <p className={`text-xs ${pwMsg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                  {pwMsg.text}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── AI Provider ── */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">AI Provider</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Your key takes priority over the platform default. Stored encrypted — never exposed.
            </p>
          </div>

          {/* Current key status */}
          {keyStatus?.has_key && (
            <div className="flex items-center justify-between bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="text-xs text-gray-300">
                  {PROVIDERS.find((p) => p.value === keyStatus.provider)?.label ?? keyStatus.provider}
                  {" · "}
                  <span className="text-gray-400 font-mono">{keyStatus.model}</span>
                </span>
              </div>
              {removeConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Remove key?</span>
                  <button onClick={handleRemoveKey} className="text-xs text-red-400 hover:text-red-300 transition-colors">Yes</button>
                  <button onClick={() => setRemoveConfirm(false)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">No</button>
                </div>
              ) : (
                <button
                  onClick={() => setRemoveConfirm(true)}
                  className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          )}

          {/* Add / replace key form */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  {PROVIDER_MODELS[provider].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400">
                API key {keyStatus?.has_key && <span className="text-gray-600">(enter new key to replace)</span>}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setKeyMsg(null); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                placeholder="sk-..."
                autoComplete="off"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveKey}
                disabled={keySaving || !apiKey.trim()}
                className="text-xs px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {keySaving ? "Testing…" : "Test & Save"}
              </button>
              {keyMsg && (
                <p className={`text-xs ${keyMsg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                  {keyMsg.text}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
