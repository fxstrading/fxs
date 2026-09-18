import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminWithdrawalsClient from "./AdminWithdrawalsClient";

export default async function AdminWithdrawalsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/dashboard");

  const { data: withdrawals } = await supabase
    .from("withdrawals")
    .select("id, user_id, amount, currency, destination_type, destination_details, status, requested_at")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  return <AdminWithdrawalsClient initialWithdrawals={withdrawals ?? []} />;
}
