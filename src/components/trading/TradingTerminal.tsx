"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PriceChart from "./PriceChart";

type Market = {
  id: string;
  symbol: string;
  display_name: string;
  type: string;
  min_lot_size: number;
  max_lot_size: number;
  max_leverage: number;
  pip_size: number;
};

type Wallet = {
  balance: number;
  locked_balance: number;
  currency: string;
};

type Position = {
  id: string;
  market_id: string;
  side: "buy" | "sell";
  volume: number;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  leverage: number;
  margin_used: number;
  status: string;
  opened_at: string;
  contract_size: number;
  markets: { symbol: string; display_name: string; pip_size: number } | null;
};

type PriceTick = { bid: number; ask: number; ts: string };

export default function TradingTerminal({
  userId,
  initialMarkets,
  initialWallet,
  initialPositions,
}: {
  userId: string;
  initialMarkets: Market[];
  initialWallet: Wallet;
  initialPositions: Position[];
}) {
  // Memoized even though createClient() is now a singleton — cheap
  // insurance so this component never re-runs its realtime effect
  // (below) on every render regardless of how the client factory
  // is implemented.
  const supabase = useMemo(() => createClient(), []);

  const [markets] = useState<Market[]>(initialMarkets);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [wallet, setWallet] = useState<Wallet>(initialWallet);
  const [positions, setPositions] = useState<Position[]>(initialPositions);
  const [prices, setPrices] = useState<Record<string, PriceTick>>({});
  const [activeMarketId, setActiveMarketId] = useState<string | null>(
    initialMarkets[0]?.id ?? null
  );

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [volume, setVolume] = useState("1");
  const [leverage, setLeverage] = useState("100");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [claimingDemo, setClaimingDemo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function playChime() {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      [0, 0.12].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = i === 0 ? 880 : 1174.66; // pleasant two-note chime
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.3);
      });
    } catch {
      // Audio blocked/unavailable — toast still shows regardless
    }
  }

  function showToast(message: string) {
    playChime();
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  const activeMarket = markets.find((m) => m.id === activeMarketId) ?? null;
  const activePrice = activeMarketId ? prices[activeMarketId] : undefined;

  const refreshWallet = useCallback(async () => {
    const { data } = await supabase
      .from("wallets")
      .select("balance, locked_balance, currency")
      .eq("user_id", userId)
      .eq("currency", "USD")
      .eq("is_demo", mode === "demo")
      .maybeSingle();
    setWallet(data ?? { balance: 0, locked_balance: 0, currency: "USD" });
  }, [supabase, userId, mode]);

  const refreshPositions = useCallback(async () => {
    const { data } = await supabase
      .from("positions")
      .select(
        "id, market_id, side, volume, entry_price, stop_loss, take_profit, leverage, margin_used, status, opened_at, contract_size, markets(symbol, display_name, pip_size)"
      )
      .eq("user_id", userId)
      .eq("status", "open")
      .eq("is_demo", mode === "demo")
      .order("opened_at", { ascending: false });
    if (data) {
      const normalized = data.map((p: (typeof data)[number]) => ({
        ...p,
        markets: Array.isArray(p.markets) ? p.markets[0] ?? null : p.markets,
      }));
      setPositions(normalized as unknown as Position[]);
    }
  }, [supabase, userId, mode]);

  // Re-fetch wallet + positions whenever the Demo/Live mode is switched
  useEffect(() => {
    refreshWallet();
    refreshPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Live price feed for every seeded market (small set, fine to subscribe to all)
  useEffect(() => {
    const channel = supabase
      .channel("trading-terminal-prices")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "market_prices" },
        (payload) => {
          const row = payload.new as { market_id: string; bid: number; ask: number; ts: string };
          setPrices((prev) => ({
            ...prev,
            [row.market_id]: { bid: row.bid, ask: row.ask, ts: row.ts },
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Positions can be closed automatically (SL/TP) by the backend worker —
  // poll periodically to stay in sync without needing a realtime sub on positions.
  useEffect(() => {
    const interval = setInterval(() => {
      refreshPositions();
      refreshWallet();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshPositions, refreshWallet]);

  async function handleClaimDemo() {
    setClaimingDemo(true);
    const { error } = await supabase.rpc("claim_demo_balance");
    setClaimingDemo(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    refreshWallet();
  }

  async function handlePlaceOrder() {
    if (!activeMarket) return;
    setFormError(null);

    const vol = parseFloat(volume);
    const lev = parseFloat(leverage);
    if (isNaN(vol) || vol < activeMarket.min_lot_size || vol > activeMarket.max_lot_size) {
      setFormError(`Volume must be between ${activeMarket.min_lot_size} and ${activeMarket.max_lot_size}`);
      return;
    }
    if (isNaN(lev) || lev < 1 || lev > activeMarket.max_leverage) {
      setFormError(`Leverage must be between 1 and ${activeMarket.max_leverage}`);
      return;
    }

    setPlacing(true);
    const { error } = await supabase.rpc("open_position", {
      p_market_id: activeMarket.id,
      p_side: side,
      p_volume: vol,
      p_leverage: lev,
      p_stop_loss: stopLoss ? parseFloat(stopLoss) : null,
      p_take_profit: takeProfit ? parseFloat(takeProfit) : null,
      p_is_demo: mode === "demo",
    });
    setPlacing(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setStopLoss("");
    setTakeProfit("");
    refreshPositions();
    refreshWallet();
    showToast("Order placed");
  }

  async function handleClosePosition(positionId: string) {
    const { error } = await supabase.rpc("close_position", { p_position_id: positionId });
    if (error) {
      setFormError(error.message);
      return;
    }
    refreshPositions();
    refreshWallet();
    showToast("Order closed");
  }

  function floatingPnl(pos: Position): number | null {
    const tick = prices[pos.market_id];
    if (!tick) return null;
    const exit = pos.side === "buy" ? tick.bid : tick.ask;
    const diff = pos.side === "buy" ? exit - pos.entry_price : pos.entry_price - exit;
    return diff * pos.volume * pos.contract_size;
  }

  const totalFloatingPnl = useMemo(
    () => positions.reduce((sum, p) => sum + (floatingPnl(p) ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positions, prices]
  );

  const availableMargin = wallet.balance - wallet.locked_balance;

  return (
    <main className="min-h-screen pb-24">
      {toast && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-lg animate-fade-up"
          style={{ background: "#4ade80", color: "#0a0a0f" }}
        >
          ✓ {toast}
        </div>
      )}

      <header
        className="sticky top-0 z-10 flex items-center gap-4 px-4 py-3"
        style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}
      >
        <Link href="/dashboard" className="text-2xl leading-none">
          ‹
        </Link>
        <h1 className="text-lg font-bold flex-1">
          <span className="fxs-logo">FXS Trading</span> Terminal
        </h1>
        <Link href="/history" className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
          History
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Demo / Live mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("demo")}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold transition"
            style={
              mode === "demo"
                ? { background: "rgba(59,130,246,0.15)", color: "var(--fxs-blue)", border: "1px solid var(--fxs-blue)" }
                : { background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }
            }
          >
            Demo
          </button>
          <button
            onClick={() => setMode("live")}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold transition"
            style={
              mode === "live"
                ? { background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid #4ade80" }
                : { background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }
            }
          >
            Live
          </button>
        </div>

        {/* Wallet summary */}
        <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-6">
            <div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Balance</p>
              <p className="text-lg font-bold">${wallet.balance.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Available margin</p>
              <p className="text-lg font-bold">${availableMargin.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Floating P/L</p>
              <p
                className="text-lg font-bold"
                style={{ color: totalFloatingPnl >= 0 ? "#4ade80" : "#f87171" }}
              >
                {totalFloatingPnl >= 0 ? "+" : ""}
                {totalFloatingPnl.toFixed(2)}
              </p>
            </div>
          </div>
          {mode === "demo" && wallet.balance === 0 && (
            <button
              onClick={handleClaimDemo}
              disabled={claimingDemo}
              className="btn-fxs rounded-xl text-sm px-4 py-2"
            >
              {claimingDemo ? "Claiming..." : "Claim $10,000 demo balance"}
            </button>
          )}
          {mode === "live" && (
            <Link href="/deposit" className="btn-fxs rounded-xl text-sm px-4 py-2 inline-flex items-center">
              Deposit funds
            </Link>
          )}
        </div>

        {/* Market tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {markets.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveMarketId(m.id)}
              className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition"
              style={
                activeMarketId === m.id
                  ? { background: "rgba(59,130,246,0.15)", color: "var(--fxs-blue)", border: "1px solid var(--fxs-blue)" }
                  : { background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }
              }
            >
              {m.symbol}
            </button>
          ))}
        </div>

        {/* Live chart */}
        {activeMarket && (
          <div className="card p-4">
            <PriceChart marketId={activeMarket.id} latestTick={activePrice} pipSize={activeMarket.pip_size} />
          </div>
        )}

        {/* Order ticket */}
        {activeMarket && (
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{activeMarket.display_name}</p>
              {activePrice ? (
                <p className="text-sm font-mono">
                  <span style={{ color: "#f87171" }}>{activePrice.bid.toFixed(2)}</span>
                  {" / "}
                  <span style={{ color: "#4ade80" }}>{activePrice.ask.toFixed(2)}</span>
                </p>
              ) : (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Waiting for price...</p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setSide("buy")}
                className="flex-1 rounded-xl py-2 text-sm font-semibold transition"
                style={
                  side === "buy"
                    ? { background: "#4ade8022", color: "#4ade80", border: "1px solid #4ade80" }
                    : { background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }
                }
              >
                Buy
              </button>
              <button
                onClick={() => setSide("sell")}
                className="flex-1 rounded-xl py-2 text-sm font-semibold transition"
                style={
                  side === "sell"
                    ? { background: "#f8717122", color: "#f87171", border: "1px solid #f87171" }
                    : { background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }
                }
              >
                Sell
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Volume ({activeMarket.min_lot_size}–{activeMarket.max_lot_size})
                </label>
                <input
                  type="number"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  className="input-field w-full px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Leverage (max {activeMarket.max_leverage}x)
                </label>
                <input
                  type="number"
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  className="input-field w-full px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Stop loss (optional)
                </label>
                <input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="—"
                  className="input-field w-full px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Take profit (optional)
                </label>
                <input
                  type="number"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  placeholder="—"
                  className="input-field w-full px-3 py-2 text-sm"
                />
              </div>
            </div>

            {formError && <p className="text-sm text-red-400">{formError}</p>}

            <button
              onClick={handlePlaceOrder}
              disabled={placing || !activePrice}
              className="btn-fxs w-full rounded-xl text-sm py-3"
            >
              {placing ? "Placing..." : `${side === "buy" ? "Buy" : "Sell"} ${activeMarket.symbol}`}
            </button>
          </div>
        )}

        {/* Open positions */}
        <div className="card p-4">
          <p className="font-semibold mb-3">Open positions ({positions.length})</p>

          {positions.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No open positions yet.
            </p>
          ) : (
            <div className="space-y-3">
              {positions.map((pos) => {
                const tick = prices[pos.market_id];
                const current = tick ? (pos.side === "buy" ? tick.bid : tick.ask) : null;
                const pnl = floatingPnl(pos);
                return (
                  <div
                    key={pos.id}
                    className="rounded-xl p-3 space-y-2"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{pos.markets?.symbol ?? "—"}</span>
                        <span
                          className="text-xs font-bold px-1.5 py-0.5 rounded"
                          style={
                            pos.side === "buy"
                              ? { background: "#4ade8022", color: "#4ade80" }
                              : { background: "#f8717122", color: "#f87171" }
                          }
                        >
                          {pos.side.toUpperCase()}
                        </span>
                      </div>
                      <span
                        className="font-bold"
                        style={{ color: pnl === null ? "var(--text-muted)" : pnl >= 0 ? "#4ade80" : "#f87171" }}
                      >
                        {pnl === null ? "—" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      <div>
                        <p>Volume</p>
                        <p className="font-mono" style={{ color: "var(--text-primary, #fff)" }}>{pos.volume}</p>
                      </div>
                      <div>
                        <p>Entry</p>
                        <p className="font-mono" style={{ color: "var(--text-primary, #fff)" }}>{pos.entry_price.toFixed(2)}</p>
                      </div>
                      <div>
                        <p>Current</p>
                        <p className="font-mono" style={{ color: "var(--text-primary, #fff)" }}>{current ? current.toFixed(2) : "—"}</p>
                      </div>
                      <div>
                        <p>Margin</p>
                        <p className="font-mono" style={{ color: "var(--text-primary, #fff)" }}>${pos.margin_used.toFixed(2)}</p>
                      </div>
                      <div>
                        <p>Stop loss</p>
                        <p className="font-mono" style={{ color: "var(--text-primary, #fff)" }}>{pos.stop_loss ? pos.stop_loss.toFixed(2) : "—"}</p>
                      </div>
                      <div>
                        <p>Take profit</p>
                        <p className="font-mono" style={{ color: "var(--text-primary, #fff)" }}>{pos.take_profit ? pos.take_profit.toFixed(2) : "—"}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleClosePosition(pos.id)}
                      className="w-full text-sm font-semibold py-2 rounded-lg transition hover:opacity-80"
                      style={{ background: "#f8717122", color: "#f87171", border: "1px solid #f87171" }}
                    >
                      Close position
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
          {mode === "demo" ? (
            <>
              Synthetic markets are simulated instruments, not real exchange-traded assets.
              This is a demo balance — no real funds are at risk.
            </>
          ) : (
            <>
              You are trading with real funds. Synthetic markets are proprietary
              simulated instruments, not real exchange-traded assets — but P/L and
              funds movement in Live mode are real.
            </>
          )}
        </p>
      </div>
    </main>
  );
}
