"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Deposit = {
  id: string;
  user_id: string;
  payment_method: string;
  provider_tracking_id: string | null;
  amount: number;
  currency: string;
  proofSignedUrl: string | null;
  created_at: string;
};

const METHOD_LABELS: Record<string, string> = {
  mpesa_paybill: "M-Pesa Paybill",
  mpesa_p2p: "M-Pesa Send Money",
  paypal: "PayPal",
  bank_transfer: "Bank Transfer",
};

export default function AdminDepositsClient({ initialDeposits }: { initialDeposits: Deposit[] }) {
  const supabase = createClient();
  const [deposits, setDeposits] = useState(initialDeposits);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function handleAction(id: string, approve: boolean) {
    const notes = approve ? null : window.prompt("Reason for rejection (shown to user):") ?? "";
    setProcessingId(id);
    const { error } = await supabase.rpc("admin_confirm_manual_deposit", {
      p_deposit_id: id,
      p_approve: approve,
      p_notes: notes,
    });
    setProcessingId(null);

    if (error) {
      alert(error.message);
      return;
    }
    setDeposits((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard" className="text-2xl leading-none mb-6 inline-block">
          ‹
        </Link>
        <h1 className="text-xl font-bold mb-6">Pending manual deposits ({deposits.length})</h1>

        {deposits.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing pending.
          </p>
        ) : (
          <div className="space-y-3">
            {deposits.map((d) => (
              <div key={d.id} className="card p-4 space-y-2">
                <div className="flex justify-between">
                  <p className="font-semibold">${d.amount.toFixed(2)} {d.currency}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {new Date(d.created_at).toLocaleString()}
                  </p>
                </div>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Method: <strong>{METHOD_LABELS[d.payment_method] ?? d.payment_method}</strong>
                </p>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Reference: <strong>{d.provider_tracking_id ?? "—"}</strong>
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  User: {d.user_id}
                </p>
                {d.proofSignedUrl && (
                  <a
                    href={d.proofSignedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="input-field inline-flex items-center justify-center py-2 px-4 text-xs font-medium hover:border-[var(--fxs-blue)] transition"
                  >
                    View proof →
                  </a>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleAction(d.id, true)}
                    disabled={processingId === d.id}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold"
                    style={{ background: "#4ade8022", color: "#4ade80", border: "1px solid #4ade80" }}
                  >
                    Approve & Credit
                  </button>
                  <button
                    onClick={() => handleAction(d.id, false)}
                    disabled={processingId === d.id}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold"
                    style={{ background: "#f8717122", color: "#f87171", border: "1px solid #f87171" }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
