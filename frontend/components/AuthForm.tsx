"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

type Mode = "sign_in" | "sign_up" | "forgot_password";

export default function AuthForm() {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tos, setTos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setVerificationSent(false);
    setResetSent(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "sign_in") {
        await signIn(email, password);
      } else if (mode === "sign_up") {
        if (!tos) { setError("Please accept the terms of service."); setLoading(false); return; }
        const result = await signUp(email, password, name);
        if (result.needsVerification) setVerificationSent(true);
      } else {
        await resetPassword(email);
        setResetSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (verificationSent) {
    return (
      <Card>
        <Logo />
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-gray-100">Check your email</p>
          <p className="text-sm text-gray-400">We sent a verification link to <span className="text-gray-200">{email}</span>. Click it to activate your account.</p>
        </div>
        <button onClick={() => switchMode("sign_in")} className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors">
          Back to sign in
        </button>
      </Card>
    );
  }

  if (resetSent) {
    return (
      <Card>
        <Logo />
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-gray-100">Reset link sent</p>
          <p className="text-sm text-gray-400">Check <span className="text-gray-200">{email}</span> for a password reset link.</p>
        </div>
        <button onClick={() => switchMode("sign_in")} className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors">
          Back to sign in
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <Logo />

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "sign_up" && (
          <Field label="Name" type="text" value={name} onChange={setName} placeholder="Your name" required autoFocus />
        )}
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required autoFocus={mode !== "sign_up"} />
        {mode !== "forgot_password" && (
          <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" required minLength={8} />
        )}
        {mode === "sign_up" && (
          <label className="flex items-start gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={tos}
              onChange={(e) => setTos(e.target.checked)}
              className="mt-0.5 accent-indigo-500 flex-shrink-0"
            />
            <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors leading-relaxed">
              I agree to the{" "}
              <a href="/terms" target="_blank" className="text-indigo-400 hover:text-indigo-300 underline">terms of service</a>
            </span>
          </label>
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition-colors"
        >
          {loading ? "…" : mode === "sign_in" ? "Sign in" : mode === "sign_up" ? "Create account" : "Send reset link"}
        </button>
      </form>

      {mode !== "forgot_password" && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-[11px] text-gray-600">or</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-200 text-sm font-medium transition-colors"
          >
            <GoogleIcon />
            Continue with Google
          </button>
        </>
      )}

      <div className="flex flex-col items-center gap-1.5 pt-1">
        {mode === "sign_in" && (
          <>
            <button onClick={() => switchMode("sign_up")} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              No account? <span className="text-indigo-400">Sign up</span>
            </button>
            <button onClick={() => switchMode("forgot_password")} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              Forgot password?
            </button>
          </>
        )}
        {mode === "sign_up" && (
          <button onClick={() => switchMode("sign_in")} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Already have an account? <span className="text-indigo-400">Sign in</span>
          </button>
        )}
        {mode === "forgot_password" && (
          <button onClick={() => switchMode("sign_in")} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Back to sign in
          </button>
        )}
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-900/80 border border-gray-700/60 rounded-2xl p-8 w-full max-w-xs shadow-2xl backdrop-blur-sm space-y-5">
      {children}
    </div>
  );
}

function Logo() {
  return (
    <div className="space-y-2">
      <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center text-white text-base font-semibold">Q</div>
      <h1 className="text-xl font-semibold text-gray-100 tracking-tight">Querywise</h1>
      <p className="text-sm text-gray-400 leading-relaxed">AI-powered queries on your own data.</p>
    </div>
  );
}

function Field({
  label, type, value, onChange, placeholder, required, autoFocus, minLength,
}: {
  label: string; type: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; autoFocus?: boolean; minLength?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        minLength={minLength}
        className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
      />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z" />
      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z" />
      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z" />
      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z" />
    </svg>
  );
}
