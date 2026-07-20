"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";

function LoginContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (mounted && !authLoading && user) router.replace("/");
  }, [mounted, authLoading, user, router]);

  if (!mounted || authLoading || user) return null;

  const initialMode = searchParams.get("mode") === "sign_up" ? "sign_up" : "sign_in";

  return <AuthForm initialMode={initialMode} />;
}

export default function LoginPage() {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        backgroundColor: "#030712",
        backgroundImage:
          "linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    >
      <Suspense fallback={null}>
        <LoginContent />
      </Suspense>
    </main>
  );
}
