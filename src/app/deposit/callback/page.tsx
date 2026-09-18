"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function DepositCallbackContent() {
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [status, setStatus] = useState<"checking" | "completed" | "pending" | "failed">("checking");

  useEffect(() => {
    const merchantRef = searchParams.get("OrderMerchantReference");
    if (!merchantRef) {
      setStatus("failed");
      return;
    }

    // The IPN webhook (server-to-server) is the source of truth for actually
    // crediting funds — this just polls our own deposits table to reflect
    // that back to the user, since the IPN call and this page landing can
    // arrive in either order.
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      const { data } = await supabase
        .from("deposits")
        .select("status")
        .eq("id", merchantRef)
        .maybeSingle();

      if (data?.status === "completed") {
        setStatus("completed");
        clearInterval(interval);
      } else if (data?.status === "failed") {
        setStatus("failed");
        clearInterval(interval);
      } else if (attempts > 20) {
        // ~40s of polling; give up and tell them to check back
        setStatus("pending");
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [searchParams, supabase]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center animate-fade-up">
        <div className="h-1.5 w-16 mx-auto mb-8 rounded-full" style={{ background: "linear-gradient(90deg, var(--fxs-blue), var(--gold))" }} />

        {status === "checking" && (
          <>
            <p className="text-lg font-bold mb-2">Confirming your payment...</p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              This usually takes a few seconds.
            </p>
          </>
        )}

        {status === "completed" && (
          <>
            <p className="text-lg font-bold mb-2" style={{ color: "#4ade80" }}>
              Deposit successful
            </p>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              Your wallet has been credited.
            </p>
            <Link href="/terminal" className="btn-fxs w-full rounded-xl text-sm py-3 inline-flex items-center justify-center">
              Go to Trading Terminal
            </Link>
          </>
        )}

        {status === "pending" && (
          <>
            <p className="text-lg font-bold mb-2" style={{ color: "var(--gold)" }}>
              Still processing
            </p>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              Your payment is taking longer than usual to confirm. Check your wallet in a few minutes.
            </p>
            <Link href="/dashboard" className="input-field w-full rounded-xl text-sm font-medium py-3 inline-flex items-center justify-center">
              Back to dashboard
            </Link>
          </>
        )}

        {status === "failed" && (
          <>
            <p className="text-lg font-bold mb-2" style={{ color: "#f87171" }}>
              Payment not completed
            </p>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              Your deposit wasn&apos;t processed. No funds were taken, or they&apos;ll be refunded automatically.
            </p>
            <Link href="/deposit" className="btn-fxs w-full rounded-xl text-sm py-3 inline-flex items-center justify-center">
              Try again
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default function DepositCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center px-4">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Loading...
          </p>
        </main>
      }
    >
      <DepositCallbackContent />
    </Suspense>
  );
}

