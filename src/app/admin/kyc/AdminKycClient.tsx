"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Submission = {
  id: string;
  user_id: string;
  status: string;
  submitted_at: string;
  id_document_signed_url: string | null;
  selfie_signed_url: string | null;
  proof_of_address_signed_url: string | null;
};

export default function AdminKycClient({ initialSubmissions }: { initialSubmissions: Submission[] }) {
  const supabase = createClient();
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function handleAction(id: string, approve: boolean) {
    const notes = approve ? null : window.prompt("Reason for rejection (shown to user):") ?? "";
    setProcessingId(id);
    const { error } = await supabase.rpc("admin_review_kyc", {
      p_submission_id: id,
      p_approve: approve,
      p_notes: notes,
    });
    setProcessingId(null);

    if (error) {
      alert(error.message);
      return;
    }
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard" className="text-2xl leading-none mb-6 inline-block">
          ‹
        </Link>
        <h1 className="text-xl font-bold mb-6">Pending KYC reviews ({submissions.length})</h1>

        {submissions.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing pending.
          </p>
        ) : (
          <div className="space-y-4">
            {submissions.map((s) => (
              <div key={s.id} className="card p-4 space-y-3">
                <div className="flex justify-between">
                  <p className="text-sm font-medium">User: {s.user_id}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {new Date(s.submitted_at).toLocaleString()}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "ID", url: s.id_document_signed_url },
                    { label: "Selfie", url: s.selfie_signed_url },
                    { label: "Address", url: s.proof_of_address_signed_url },
                  ].map((doc) => (
                    <a
                      key={doc.label}
                      href={doc.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="input-field flex flex-col items-center justify-center py-4 text-xs font-medium hover:border-[var(--fxs-blue)] transition"
                    >
                      {doc.label}
                      <span style={{ color: "var(--text-muted)" }}>view →</span>
                    </a>
                  ))}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleAction(s.id, true)}
                    disabled={processingId === s.id}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold"
                    style={{ background: "#4ade8022", color: "#4ade80", border: "1px solid #4ade80" }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(s.id, false)}
                    disabled={processingId === s.id}
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
