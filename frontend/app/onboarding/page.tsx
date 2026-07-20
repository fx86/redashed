"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { createUserConnection } from "@/lib/api";
import type { SavedConnection } from "@/lib/api";
import SavedConnectionForm from "@/components/SavedConnectionForm";

type Step = "pick" | "adding" | "done";

export default function OnboardingPage() {
  const { user, session, loading: authLoading } = useAuth();
  const router = useRouter();
  const jwt = session?.access_token ?? "";

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [connName, setConnName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (mounted && !authLoading && !user) router.replace("/");
  }, [mounted, authLoading, user, router]);

  function finish() {
    localStorage.setItem("onboarding_done", "1");
    router.replace("/");
  }

  function skip() {
    localStorage.setItem("onboarding_done", "1");
    router.replace("/");
  }

  async function handleAddWarehouse(body: {
    name: string; db_type?: string; host: string; port: number;
    database: string; db_user: string; password: string;
    extra_config?: Record<string, unknown>;
  }) {
    setAdding(true);
    setError(null);
    try {
      const conn = await createUserConnection(jwt, body);
      setConnName(conn.name);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add connection");
    } finally {
      setAdding(false);
    }
  }

  function handleDataGovImport(conn: SavedConnection) {
    setConnName(conn.name);
    setStep("done");
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
    <main
      className="min-h-screen flex items-start justify-center px-4 pt-16 pb-8"
      style={{
        backgroundColor: "#030712",
        backgroundImage:
          "linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    >
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center text-white text-xs font-bold">Q</div>
            <span className="text-sm font-semibold text-gray-100">Querywise</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-100 tracking-tight mt-4">Connect your first data source</h1>
          <p className="text-sm text-gray-400">You can always add more later.</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2">
          {["Connect", "Done"].map((label, i) => {
            const active = (i === 0 && step !== "done") || (i === 1 && step === "done");
            const complete = i === 0 && step === "done";
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium transition-colors ${
                  complete ? "bg-indigo-600 text-white" : active ? "bg-gray-700 border border-indigo-500 text-indigo-400" : "bg-gray-800 text-gray-600"
                }`}>
                  {complete ? "✓" : i + 1}
                </div>
                <span className={`text-xs ${active ? "text-gray-200" : "text-gray-600"}`}>{label}</span>
                {i === 0 && <div className="w-8 h-px bg-gray-800" />}
              </div>
            );
          })}
        </div>

        {/* Step: pick + add */}
        {step !== "done" && (
          <div className="space-y-4">
            {error && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded p-3">{error}</p>
            )}

            <SavedConnectionForm
              onSave={handleAddWarehouse}
              onCancel={skip}
              loading={adding}
              jwt={jwt}
              onDataGovImport={handleDataGovImport}
            />

            <button onClick={skip} className="text-xs text-gray-600 hover:text-gray-400 transition-colors block">
              Skip for now
            </button>
          </div>
        )}

        {/* Step: done */}
        {step === "done" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-gray-100">You're all set</p>
              <p className="text-sm text-gray-400"><span className="text-gray-200">{connName}</span> is connected and ready to query.</p>
            </div>
            <button
              onClick={finish}
              className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
            >
              Start querying →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
