import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function TradeHistoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: trades } = await supabase
    .from("positions")
    .select(
      "id, side, volume, entry_price, exit_price, realized_pnl, is_demo, opened_at, closed_at, markets(symbol, display_name)"
    )
    .eq("user_id", user.id)
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(100);

  const normalized = (trades ?? []).map((t) => ({
    ...t,
    markets: Array.isArray(t.markets) ? t.markets[0] ?? null : t.markets,
  }));

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/terminal" className="text-2xl leading-none">
            ‹
          </Link>
          <h1 className="text-xl font-bold">Trade History</h1>
        </div>

        {normalized.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No closed trades yet.
          </p>
        ) : (
          <div className="space-y-3">
            {normalized.map((t) => (
              <div
                key={t.id}
                className="rounded-xl p-3 space-y-2"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t.markets?.symbol ?? "—"}</span>
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded"
                      style={
                        t.side === "buy"
                          ? { background: "#4ade8022", color: "#4ade80" }
                          : { background: "#f8717122", color: "#f87171" }
                      }
                    >
                      {t.side.toUpperCase()}
                    </span>
                    {t.is_demo && (
                      <span
                        className="text-xs font-bold px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(59,130,246,0.15)", color: "var(--fxs-blue)" }}
                      >
                        DEMO
                      </span>
                    )}
                  </div>
                  <span
                    className="font-bold"
                    style={{ color: (t.realized_pnl ?? 0) >= 0 ? "#4ade80" : "#f87171" }}
                  >
                    {(t.realized_pnl ?? 0) >= 0 ? "+" : ""}
                    {(t.realized_pnl ?? 0).toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <div>
                    <p>Volume</p>
                    <p className="font-mono" style={{ color: "#fff" }}>{t.volume}</p>
                  </div>
                  <div>
                    <p>Entry</p>
                    <p className="font-mono" style={{ color: "#fff" }}>{t.entry_price.toFixed(2)}</p>
                  </div>
                  <div>
                    <p>Exit</p>
                    <p className="font-mono" style={{ color: "#fff" }}>{t.exit_price?.toFixed(2) ?? "—"}</p>
                  </div>
                </div>

                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Closed {t.closed_at ? new Date(t.closed_at).toLocaleString() : "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
