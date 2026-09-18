"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  destination_type: string;
  destination_details: Record<string, string>;
  status: string;
  requested_at: string;
};

export default function AdminWithdrawalsClient({ initialWithdrawals }: { initialWithdrawals: Withdrawal[] }) {
  const supabase = createClient();
  const [withdrawals, setWithdrawals] = useState(initialWithdrawals);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function handleAction(id: string, approve: boolean) {
    const notes = approve ? null : window.prompt("Reason for rejection (shown to user):") ?? "";
    setProcessingId(id);
    const { error } = await supabase.rpc("admin_process_withdrawal", {
      p_withdrawal_id: id,
      p_approve: approve,
      p_notes: notes,
    });
    setProcessingId(null);

    if (error) {
      alert(error.message);
      return;
    }
    setWithdrawals((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard" className="text-2xl leading-none mb-6 inline-block">
          ‹
        </Link>
        <h1 className="text-xl font-bold mb-6">Pending withdrawals ({withdrawals.length})</h1>

        {withdrawals.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing pending.
          </p>
        ) : (
          <div className="space-y-3">
            {withdrawals.map((w) => (
              <div key={w.id} className="card p-4 space-y-2">
                <div className="flex justify-between">
                  <p className="font-semibold">${w.amount.toFixed(2)} {w.currency}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {new Date(w.requested_at).toLocaleString()}
                  </p>
                </div>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  User: {w.user_id}
                </p>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Via {w.destination_type}:{" "}
                  {w.destination_details.phone_number ??
                    `${w.destination_details.bank_name ?? ""} ${w.destination_details.account_number ?? ""}`}
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleAction(w.id, true)}
                    disabled={processingId === w.id}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold"
                    style={{ background: "#4ade8022", color: "#4ade80", border: "1px solid #4ade80" }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(w.id, false)}
                    disabled={processingId === w.id}
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
