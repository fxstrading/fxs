"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Method = "mpesa" | "card" | "bank";

const METHOD_LABELS: Record<Method, string> = {
  mpesa: "M-Pesa",
  card: "Card / Apple Pay",
  bank: "Bank (Pesalink)",
};

const MIN_DEPOSIT_USD = 10;

declare global {
  interface Window {
    PaystackPop?: new () => {
      resumeTransaction: (
        accessCode: string,
        callbacks: {
          onSuccess: (transaction: unknown) => void;
          onCancel: () => void;
          onError: (err: { message: string }) => void;
        }
      ) => void;
    };
  }
}

function loadPaystackScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) return resolve();
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v2/inline.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Paystack"));
    document.body.appendChild(script);
  });
}

export default function DepositPage() {
  const supabase = createClient();

  const [method, setMethod] = useState<Method>("mpesa");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountKes, setAmountKes] = useState<number | null>(null);

  const [stkSent, setStkSent] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<"waiting" | "completed" | "failed" | null>(null);

  function pollDepositStatus(depositId: string) {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      const { data } = await supabase.from("deposits").select("status").eq("id", depositId).maybeSingle();

      if (data?.status === "completed") {
        setPollingStatus("completed");
        clearInterval(interval);
      } else if (data?.status === "failed") {
        setPollingStatus("failed");
        clearInterval(interval);
      } else if (attempts > 30) {
        clearInterval(interval);
      }
    }, 2000);
  }

  async function handleMpesaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < MIN_DEPOSIT_USD) {
      setError(`Minimum deposit is $${MIN_DEPOSIT_USD}`);
      return;
    }
    if (!phone.trim()) {
      setError("Enter the M-Pesa phone number to receive the prompt");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/trading/deposit/paystack/mpesa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, phone }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }

      setAmountKes(data.amountKes ?? null);
      setStkSent(true);
      setPollingStatus("waiting");
      pollDepositStatus(data.depositId);
    } catch {
      setError("Could not reach Paystack. Try again.");
      setLoading(false);
    }
  }

  async function handleCheckoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < MIN_DEPOSIT_USD) {
      setError(`Minimum deposit is $${MIN_DEPOSIT_USD}`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/trading/deposit/paystack/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, method }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }

      setAmountKes(data.amountKes ?? null);

      await loadPaystackScript();
      const popup = new window.PaystackPop!();
      popup.resumeTransaction(data.accessCode, {
        onSuccess: () => {
          setStkSent(true);
          setPollingStatus("waiting");
          pollDepositStatus(data.depositId);
        },
        onCancel: () => {
          setLoading(false);
        },
        onError: (err) => {
          setError(err.message || "Payment failed");
          setLoading(false);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
      setLoading(false);
    }
  }

  if (stkSent) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center animate-fade-up">
          {pollingStatus === "waiting" && (
            <>
              <p className="text-lg font-bold mb-2">
                {method === "mpesa" ? "Check your phone" : "Confirming payment..."}
              </p>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                {method === "mpesa"
                  ? `Enter your M-Pesa PIN on the prompt sent to ${phone} to complete the deposit.`
                  : "This usually takes a few seconds."}
              </p>
            </>
          )}
          {pollingStatus === "completed" && (
            <>
              <p className="text-lg font-bold mb-2" style={{ color: "#4ade80" }}>
                Deposit successful
              </p>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                Your wallet has been credited ${amount}.
              </p>
              <Link href="/terminal" className="btn-fxs w-full rounded-xl text-sm py-3 inline-flex items-center justify-center">
                Go to Trading Terminal
              </Link>
            </>
          )}
          {pollingStatus === "failed" && (
            <>
              <p className="text-lg font-bold mb-2" style={{ color: "#f87171" }}>
                Payment not completed
              </p>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                No funds were taken. You can try again.
              </p>
              <button
                onClick={() => {
                  setStkSent(false);
                  setPollingStatus(null);
                  setLoading(false);
                }}
                className="btn-fxs w-full rounded-xl text-sm py-3"
              >
                Try again
              </button>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm animate-fade-up">
        <Link href="/terminal" className="text-2xl leading-none mb-6 inline-block">
          ‹
        </Link>

        <div className="h-1.5 w-16 mx-auto mb-8 rounded-full" style={{ background: "linear-gradient(90deg, var(--fxs-blue), var(--gold))" }} />

        <h1 className="text-2xl font-extrabold tracking-tight text-center mb-6">
          Deposit to <span className="fxs-logo">FXS Trading</span>
        </h1>

        <div className="flex gap-1.5 mb-6 flex-wrap">
          {(Object.keys(METHOD_LABELS) as Method[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMethod(m);
                setError(null);
              }}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition"
              style={
                method === m
                  ? { background: "rgba(59,130,246,0.15)", color: "var(--fxs-blue)", border: "1px solid var(--fxs-blue)" }
                  : { background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }
              }
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>

        {method === "mpesa" ? (
          <form onSubmit={handleMpesaSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount (USD)</label>
              <input
                type="number"
                min={MIN_DEPOSIT_USD}
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-field w-full px-3.5 py-2.5 text-sm"
                placeholder={`Minimum $${MIN_DEPOSIT_USD}`}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">M-Pesa phone number</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-field w-full px-3.5 py-2.5 text-sm"
                placeholder="e.g. 254712345678"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={loading} className="btn-fxs w-full rounded-xl text-sm py-3">
              {loading ? "Sending prompt..." : "Send M-Pesa prompt"}
            </button>
            <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
              You&apos;ll get an instant M-Pesa PIN prompt on your phone. You&apos;re charged the KES
              equivalent at the current exchange rate — your wallet is credited in USD.
            </p>
          </form>
        ) : (
          <form onSubmit={handleCheckoutSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount (USD)</label>
              <input
                type="number"
                min={MIN_DEPOSIT_USD}
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-field w-full px-3.5 py-2.5 text-sm"
                placeholder={`Minimum $${MIN_DEPOSIT_USD}`}
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={loading} className="btn-fxs w-full rounded-xl text-sm py-3">
              {loading ? "Loading..." : method === "card" ? "Pay with card or Apple Pay" : "Pay via bank transfer"}
            </button>
            <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
              {method === "card"
                ? "Apple Pay appears automatically on supported Safari/iOS devices, alongside card entry."
                : "You'll enter your bank details securely via Paystack — never stored on our servers."}{" "}
              You&apos;re charged the KES equivalent at the current exchange rate — your wallet is
              credited in USD.
            </p>
          </form>
        )}

        {amountKes && (
          <p className="text-xs text-center mt-4" style={{ color: "var(--text-muted)" }}>
            Charged: KES {amountKes.toLocaleString()}
          </p>
        )}
      </div>
    </main>
  );
}
