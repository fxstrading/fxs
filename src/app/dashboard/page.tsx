import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function TradingDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Creates a trading_profiles row for this user if one doesn't exist yet.
  // Safe to call every time — it's a no-op after the first call.
  await supabase.rpc("bootstrap_trading_profile");

  // Funhouse's profiles table may or may not have a row for this user —
  // it exists if they originally signed up through Funhouse, but not if
  // they signed up directly here. maybeSingle() (not single()) so a missing
  // row is null rather than a thrown error; we fall back to their email.
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    profile?.display_name ?? profile?.username ?? user.email?.split("@")[0] ?? "trader";

  const { data: isAdmin } = await supabase.rpc("is_admin");

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md text-center animate-fade-up">
        <div className="h-1.5 w-16 mx-auto mb-8 rounded-full" style={{ background: "linear-gradient(90deg, var(--fxs-blue), var(--gold))" }} />

        <h1 className="text-2xl font-extrabold tracking-tight mb-2">
          You&apos;re in, <span className="fxs-logo">{displayName}</span>
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
          Your FXS Trading account is set up.
        </p>

        <Link
          href="/terminal"
          className="btn-fxs w-full rounded-xl text-sm py-3 inline-flex items-center justify-center mb-3"
        >
          Open Trading Terminal
        </Link>

        <div className="grid grid-cols-3 gap-2 mb-6">
          <Link href="/deposit" className="input-field rounded-xl text-sm font-medium py-3 flex items-center justify-center hover:border-[var(--fxs-blue)] transition">
            Deposit
          </Link>
          <Link href="/withdraw" className="input-field rounded-xl text-sm font-medium py-3 flex items-center justify-center hover:border-[var(--fxs-blue)] transition">
            Withdraw
          </Link>
          <Link href="/kyc" className="input-field rounded-xl text-sm font-medium py-3 flex items-center justify-center hover:border-[var(--fxs-blue)] transition">
            Verify ID
          </Link>
        </div>

        {isAdmin && (
          <div className="card p-4 text-left space-y-2 mb-6">
            <p className="text-sm font-semibold">Admin</p>
            <div className="flex gap-2">
              <Link href="/admin/deposits" className="flex-1 input-field rounded-lg text-xs font-medium py-2 flex items-center justify-center hover:border-[var(--fxs-blue)] transition">
                Review deposits
              </Link>
              <Link href="/admin/withdrawals" className="flex-1 input-field rounded-lg text-xs font-medium py-2 flex items-center justify-center hover:border-[var(--fxs-blue)] transition">
                Review withdrawals
              </Link>
              <Link href="/admin/kyc" className="flex-1 input-field rounded-lg text-xs font-medium py-2 flex items-center justify-center hover:border-[var(--fxs-blue)] transition">
                Review KYC
              </Link>
            </div>
          </div>
        )}

        <Link
          href="/history"
          className="input-field w-full rounded-xl text-sm font-medium py-3 inline-flex items-center justify-center hover:border-[var(--fxs-blue)] transition"
        >
          Trade History
        </Link>
      </div>
    </main>
  );
}
