import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminKycClient from "./AdminKycClient";

export default async function AdminKycPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/dashboard");

  const { data: submissions } = await supabase
    .from("kyc_submissions")
    .select("id, user_id, id_document_url, selfie_url, proof_of_address_url, status, submitted_at")
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  // Generate short-lived signed URLs server-side for each document, since
  // the storage bucket is private.
  const withSignedUrls = await Promise.all(
    (submissions ?? []).map(async (s) => {
      const [idUrl, selfieUrl, addressUrl] = await Promise.all([
        supabase.storage.from("kyc-documents").createSignedUrl(s.id_document_url, 600),
        supabase.storage.from("kyc-documents").createSignedUrl(s.selfie_url, 600),
        supabase.storage.from("kyc-documents").createSignedUrl(s.proof_of_address_url, 600),
      ]);
      return {
        ...s,
        id_document_signed_url: idUrl.data?.signedUrl ?? null,
        selfie_signed_url: selfieUrl.data?.signedUrl ?? null,
        proof_of_address_signed_url: addressUrl.data?.signedUrl ?? null,
      };
    })
  );

  return <AdminKycClient initialSubmissions={withSignedUrls} />;
}
