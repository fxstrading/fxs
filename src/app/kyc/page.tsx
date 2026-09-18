"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function KycPage() {
  const supabase = createClient();

  const [idDoc, setIdDoc] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [proofOfAddress, setProofOfAddress] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function uploadFile(file: File, label: string, userId: string) {
    const ext = file.name.split(".").pop();
    const path = `${userId}/${label}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("kyc-documents").upload(path, file, {
      upsert: false,
    });
    if (uploadError) throw new Error(`${label} upload failed: ${uploadError.message}`);
    return path;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!idDoc || !selfie || !proofOfAddress) {
      setError("Please upload all three documents");
      return;
    }

    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const [idPath, selfiePath, addressPath] = await Promise.all([
        uploadFile(idDoc, "id", user.id),
        uploadFile(selfie, "selfie", user.id),
        uploadFile(proofOfAddress, "address", user.id),
      ]);

      const { error: rpcError } = await supabase.rpc("submit_kyc", {
        p_id_document_url: idPath,
        p_selfie_url: selfiePath,
        p_proof_of_address_url: addressPath,
      });
      if (rpcError) throw new Error(rpcError.message);

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center animate-fade-up">
          <p className="text-lg font-bold mb-2" style={{ color: "#4ade80" }}>
            Submitted for review
          </p>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            We&apos;ll notify you once your identity has been verified. This usually takes 1-2 business days.
          </p>
          <Link href="/dashboard" className="btn-fxs w-full rounded-xl text-sm py-3 inline-flex items-center justify-center">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm animate-fade-up">
        <Link href="/dashboard" className="text-2xl leading-none mb-6 inline-block">
          ‹
        </Link>

        <div className="h-1.5 w-16 mx-auto mb-8 rounded-full" style={{ background: "linear-gradient(90deg, var(--fxs-blue), var(--gold))" }} />

        <h1 className="text-2xl font-extrabold tracking-tight text-center mb-2">Verify your identity</h1>
        <p className="text-sm text-center mb-8" style={{ color: "var(--text-muted)" }}>
          Required before your first withdrawal. Reviewed by our team manually.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Government-issued ID</label>
            <input
              type="file"
              accept="image/*,.pdf"
              required
              onChange={(e) => setIdDoc(e.target.files?.[0] ?? null)}
              className="input-field w-full px-3.5 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-elevated)] file:px-3 file:py-1.5 file:text-xs"
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              National ID, passport, or driver&apos;s license
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Selfie holding your ID</label>
            <input
              type="file"
              accept="image/*"
              required
              onChange={(e) => setSelfie(e.target.files?.[0] ?? null)}
              className="input-field w-full px-3.5 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-elevated)] file:px-3 file:py-1.5 file:text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Proof of address</label>
            <input
              type="file"
              accept="image/*,.pdf"
              required
              onChange={(e) => setProofOfAddress(e.target.files?.[0] ?? null)}
              className="input-field w-full px-3.5 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-elevated)] file:px-3 file:py-1.5 file:text-xs"
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Utility bill or bank statement, less than 3 months old
            </p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" disabled={uploading} className="btn-fxs w-full rounded-xl text-sm py-3">
            {uploading ? "Uploading..." : "Submit for review"}
          </button>
        </form>
      </div>
    </main>
  );
}
