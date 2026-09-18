"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function TradingGatewayPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <button onClick={() => router.back()} className="text-2xl leading-none mb-6">
          ‹
        </button>

        <div className="h-1.5 w-16 mx-auto mb-8 rounded-full" style={{ background: "linear-gradient(90deg, var(--fxs-blue), var(--gold))" }} />

        <div className="text-center space-y-2 mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="fxs-logo">FXS Trading</span>
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Trade Forex. Trade Synthetic Markets. Trade Without Limits.
          </p>
        </div>

        <div className="card p-4 mb-6 space-y-2">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Create an account and complete identity verification to deposit
            and start trading. Practice risk-free in Demo mode first.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/signup"
            className="btn-fxs w-full rounded-xl text-sm py-3 flex items-center justify-center"
          >
            Create FXS Trading account
          </Link>
          <Link
            href="/login"
            className="input-field w-full rounded-xl text-sm font-medium py-3 flex items-center justify-center hover:border-[var(--fxs-blue)] transition"
          >
            Log in to FXS Trading
          </Link>
        </div>

        <p className="text-center text-xs mt-8" style={{ color: "var(--text-muted)" }}>
          Trading synthetic and forex markets carries significant risk.
          You can lose some or all of your invested capital.
        </p>
      </div>
    </main>
  );
}
