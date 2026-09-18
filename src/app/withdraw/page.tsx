"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function WithdrawPage() {
  const supabase = createClient();

  const [amount, setAmount] = useState("");
  const [destinationType, setDestinationType] = useState<"mpesa" | "bank">("mpesa");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankName, setBankName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 10) {
      setError("Minimum withdrawal is $10");
      return;
    }

    const destinationDetails =
      destinationType === "mpesa" ? { phone_number: phoneNumber } : { bank_name: bankName, account_number: bankAccount };

    setLoading(true);
    const { error: rpcError } = await supabase.rpc("request_withdrawal", {
      p_amount: amt,
      p_currency: "USD",
      p_destination_type: destinationType,
      p_destination_details: destinationDetails,
    });
    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center animate-fade-up">
          <p className="text-lg font-bold mb-2" style={{ color: "#4ade80" }}>
            Withdrawal requested
          </p>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Your funds are on hold and your request is pending admin review.
          </p>
          <Link href="/terminal" className="btn-fxs w-full rounded-xl text-sm py-3 inline-flex items-center justify-center">
            Back to Terminal
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <Link href="/terminal" className="text-2xl leading-none mb-6 inline-block">
          ‹
        </Link>

        <div className="h-1.5 w-16 mx-auto mb-8 rounded-full" style={{ background: "linear-gradient(90deg, var(--fxs-blue), var(--gold))" }} />

        <h1 className="text-2xl font-extrabold tracking-tight text-center mb-2">Withdraw funds</h1>
        <p className="text-sm text-center mb-8" style={{ color: "var(--text-muted)" }}>
          Minimum $10. Requires KYC approval and admin review.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Amount (USD)</label>
            <input
              type="number"
              min={10}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-field w-full px-3.5 py-2.5 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDestinationType("mpesa")}
              className="flex-1 rounded-xl py-2 text-sm font-semibold transition"
              style={
                destinationType === "mpesa"
                  ? { background: "rgba(59,130,246,0.15)", color: "var(--fxs-blue)", border: "1px solid var(--fxs-blue)" }
                  : { background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }
              }
            >
              M-Pesa
            </button>
            <button
              type="button"
              onClick={() => setDestinationType("bank")}
              className="flex-1 rounded-xl py-2 text-sm font-semibold transition"
              style={
                destinationType === "bank"
                  ? { background: "rgba(59,130,246,0.15)", color: "var(--fxs-blue)", border: "1px solid var(--fxs-blue)" }
                  : { background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }
              }
            >
              Bank transfer
            </button>
          </div>

          {destinationType === "mpesa" ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">M-Pesa phone number</label>
              <input
                type="tel"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="input-field w-full px-3.5 py-2.5 text-sm"
                placeholder="e.g. 254712345678"
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bank name</label>
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="input-field w-full px-3.5 py-2.5 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Account number</label>
                <input
                  type="text"
                  required
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  className="input-field w-full px-3.5 py-2.5 text-sm"
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" disabled={loading} className="btn-fxs w-full rounded-xl text-sm py-3">
            {loading ? "Submitting..." : "Request withdrawal"}
          </button>
        </form>
      </div>
    </main>
  );
}
