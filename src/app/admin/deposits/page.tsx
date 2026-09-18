import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminDepositsClient from "./AdminDepositsClient";

export default async function AdminDepositsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/dashboard");

  const { data: deposits } = await supabase
    .from("deposits")
    .select("id, user_id, payment_method, provider_tracking_id, amount, currency, proof_url, created_at")
    .eq("provider", "manual")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const withSignedUrls = await Promise.all(
    (deposits ?? []).map(async (d) => {
      let proofSignedUrl: string | null = null;
      if (d.proof_url) {
        const { data } = await supabase.storage.from("deposit-proofs").createSignedUrl(d.proof_url, 600);
        proofSignedUrl = data?.signedUrl ?? null;
      }
      return { ...d, proofSignedUrl };
    })
  );

  return <AdminDepositsClient initialDeposits={withSignedUrls} />;
}
