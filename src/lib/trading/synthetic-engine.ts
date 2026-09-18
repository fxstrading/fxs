// src/lib/trading/synthetic-engine.ts
//
// Same price model as the standalone worker script, but runs as an
// in-process background loop inside the Funhouse server instead of a
// separate deployment. Started once from src/instrumentation.ts.

import { createAdminClient } from "@/lib/supabase/admin";

type SyntheticConfig = {
  base_price: number;
  volatility: number;
  tick_speed_ms: number;
  drift?: number;
  spread_pct: number;
  jump_probability?: number;
  jump_size_pct?: number;
};

type Market = {
  id: string;
  symbol: string;
  synthetic_config: SyntheticConfig;
};

const priceState = new Map<string, number>();

function gaussianRandom() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function nextPrice(current: number, cfg: SyntheticConfig, symbol: string) {
  const dt = cfg.tick_speed_ms / 1000 / 86400;
  // Mean-reversion: pulls the price back toward base_price over time,
  // proportional to how far it's drifted (in log terms). Without this,
  // small persistent drift + occasional jumps compound over many hours
  // of continuous ticking into runaway values (this is what happened to
  // BOOM500 — it walked up to the trillions). This keeps normal short-term
  // volatility and jumps intact while preventing long-run blowup.
  const reversionSpeed = 0.05;
  const meanReversionDrift = reversionSpeed * Math.log(cfg.base_price / current);
  const drift = ((cfg.drift ?? 0) + meanReversionDrift) * dt;
  const shock = cfg.volatility * Math.sqrt(dt) * gaussianRandom();
  let price = current * Math.exp(drift + shock);

  if (cfg.jump_probability && Math.random() < cfg.jump_probability) {
    const direction = symbol.startsWith("CRASH") ? -1 : symbol.startsWith("BOOM") ? 1 : Math.random() < 0.5 ? -1 : 1;
    price *= 1 + direction * (cfg.jump_size_pct ?? 0);
  }
  return Math.max(price, 0.01);
}

export function startSyntheticEngine() {
  // Don't crash the whole app if Supabase env vars aren't set yet in this
  // environment — just skip starting the engine and log it.
  let supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error("[synthetic-engine] not starting:", (err as Error).message);
    return;
  }

  async function tickMarket(market: Market) {
    const cfg = market.synthetic_config;
    const current = priceState.get(market.id) ?? cfg.base_price;
    const mid = nextPrice(current, cfg, market.symbol);
    const spread = mid * cfg.spread_pct;
    const bid = mid - spread / 2;
    const ask = mid + spread / 2;

    priceState.set(market.id, mid);

    const { error } = await supabase!.rpc("record_synthetic_tick", {
      p_market_id: market.id,
      p_bid: bid,
      p_ask: ask,
    });
    if (error) console.error(`[synthetic-engine] [${market.symbol}] tick failed:`, error.message);
  }

  async function boot() {
    const { data: markets, error } = await supabase!
      .from("markets")
      .select("id, symbol, synthetic_config")
      .eq("type", "synthetic")
      .eq("is_active", true);

    if (error) {
      console.error("[synthetic-engine] failed to load markets:", error.message);
      return;
    }
    if (!markets || markets.length === 0) {
      console.warn("[synthetic-engine] no active synthetic markets found — nothing to tick.");
      return;
    }

    console.log(`[synthetic-engine] starting for ${markets.length} market(s):`);
    for (const market of markets as Market[]) {
      console.log(`  - ${market.symbol} (${market.synthetic_config.tick_speed_ms}ms ticks)`);
      setInterval(() => tickMarket(market), market.synthetic_config.tick_speed_ms);
    }
  }

  boot();
}
