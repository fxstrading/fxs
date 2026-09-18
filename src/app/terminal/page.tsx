import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TradingTerminal from "@/components/trading/TradingTerminal";

export default async function TradingTerminalPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await supabase.rpc("bootstrap_trading_profile");

  const [{ data: markets }, { data: wallet }, { data: positions }] = await Promise.all([
    supabase
      .from("markets")
      .select("id, symbol, display_name, type, min_lot_size, max_lot_size, max_leverage, pip_size")
      .eq("is_active", true)
      .order("symbol"),
    supabase
      .from("wallets")
      .select("balance, locked_balance, currency")
      .eq("user_id", user.id)
      .eq("currency", "USD")
      .eq("is_demo", true)
      .maybeSingle(),
    supabase
      .from("positions")
      .select(
        "id, market_id, side, volume, entry_price, stop_loss, take_profit, leverage, margin_used, status, opened_at, contract_size, markets(symbol, display_name, pip_size)"
      )
      .eq("user_id", user.id)
      .eq("status", "open")
      .eq("is_demo", true)
      .order("opened_at", { ascending: false }),
  ]);

  const normalizedPositions = (positions ?? []).map((p: (typeof positions)[number]) => ({
    ...p,
    markets: Array.isArray(p.markets) ? p.markets[0] ?? null : p.markets,
  }));

  return (
    <TradingTerminal
      userId={user.id}
      initialMarkets={markets ?? []}
      initialWallet={wallet ?? { balance: 0, locked_balance: 0, currency: "USD" }}
      initialPositions={normalizedPositions}
    />
  );
}
