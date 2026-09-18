"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function TradingLoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="h-1.5 w-16 mx-auto mb-8 rounded-full" style={{ background: "linear-gradient(90deg, var(--fxs-blue), var(--gold))" }} />

        <div className="text-center space-y-1.5 mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Welcome back to <span className="fxs-logo">FXS Trading</span>
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Log in to access your trading account
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field w-full px-3.5 py-2.5 text-sm"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field w-full px-3.5 py-2.5 text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-fxs w-full rounded-xl text-sm py-3"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            OR
          </span>
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        </div>

        <button
          onClick={handleGoogleLogin}
          className="input-field w-full rounded-xl text-sm font-medium py-3 hover:border-[var(--fxs-blue)] transition"
        >
          Continue with Google
        </button>

        <p className="text-center text-sm mt-6" style={{ color: "var(--text-muted)" }}>
          Don&apos;t have an FXS Trading account?{" "}
          <Link href="/signup" className="font-semibold" style={{ color: "var(--fxs-blue)" }}>
            Sign up
          </Link>
        </p>
        <p className="text-center text-xs mt-4">
          <a
            href="/FXS-Trading.apk"
            className="font-medium"
            style={{ color: "var(--fxs-blue)" }}
          >
            ⬇ Download the FXS Trading Android app
          </a>
        </p>
        <p className="text-center text-xs mt-3" style={{ color: "var(--text-muted)" }}>
          <Link href="/">‹ Back</Link>
        </p>
      </div>
    </main>
  );
}
