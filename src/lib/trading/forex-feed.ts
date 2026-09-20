// src/lib/trading/forex-feed.ts
//
// Real forex pairs use actual exchange rate data (CurrencyFreaks), unlike
// the fully-synthetic indices. But CurrencyFreaks only updates about once
// a minute and gives a single mid-rate (no bid/ask), which isn't enough to
// power a "live-feeling" chart on its own. So this:
//
//   1. Fetches real rates periodically (default hourly, to stay well within
//      CurrencyFreaks' free-tier 1,000 calls/month limit) and treats that
//      as the current "anchor" price for each pair.
//   2. Between real fetches, applies small random jitter around that
//      anchor (much smaller volatility than the synthetic engine, and
//      always pulled back toward the anchor) so the chart still moves
//      tick-to-tick, without ever drifting away from the real rate.
//
// Requires CURRENCYFREAKS_API_KEY env var. Sign up free at currencyfreaks.com.

import { createAdminClient } from "@/lib/supabase/admin";

type ForexMarket = {
  id: string;
  symbol: string;
  synthetic_config: {
    tick_speed_ms: number;
    jitter_volatility: number;
    fetch_interval_ms: number;
  };
};

// symbol -> which CurrencyFreaks rate(s) to derive it from, and how
const PAIR_DERIVATIONS: Record<string, (rates: Record<string, number>) => number> = {
  EURUSD: (r) => 1 / r.EUR,
  GBPUSD: (r) => 1 / r.GBP,
  USDJPY: (r) => r.JPY,
  USDCHF: (r) => r.CHF,
  AUDUSD: (r) => 1 / r.AUD,
  USDCAD: (r) => r.CAD,
  // New currency pairs — same inversion convention as above: pairs quoted
  // as "foreign currency per 1 USD" (NZD, unlike the others which quote
  // USD as the base) get 1/rate; pairs where USD is already the base
  // currency (ZAR, SGD, HKD, MXN, INR, TRY) use the rate directly.
  NZDUSD: (r) => 1 / r.NZD,
  USDZAR: (r) => r.ZAR,
  USDSGD: (r) => r.SGD,
  USDHKD: (r) => r.HKD,
  USDMXN: (r) => r.MXN,
  USDINR: (r) => r.INR,
  USDTRY: (r) => r.TRY,
  // Precious metals — CurrencyFreaks quotes these the same way as fiat
  // (units of metal per 1 USD, a tiny fraction), so 1/rate gives the USD
  // price of one troy ounce, same pattern as XAUUSD.
  XAUUSD: (r) => 1 / r.XAU,
  XAGUSD: (r) => 1 / r.XAG,
  XPTUSD: (r) => 1 / r.XPT,
  XPDUSD: (r) => 1 / r.XPD,
};

const anchorPrices = new Map<string, number>();
const currentPrices = new Map<string, number>(); // the jittered price shown to users, walks around the anchor

// Not tied to a specific chart market — this is the raw USD->KES rate,
// used by the deposit flow to convert a USD amount into what actually gets
// charged via M-Pesa/card (which settle in KES). Updated on the same
// hourly cycle as the forex chart anchors, reusing the same API call
// (added KES to the existing symbols list) rather than firing a separate
// request per deposit.
let usdToKesRate: number | null = null;

export function getUsdToKesRate(): number | null {
  return usdToKesRate;
}

function gaussianRandom() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

async function fetchRealRates(): Promise<Record<string, number> | null> {
  const apiKey = process.env.CURRENCYFREAKS_API_KEY;
  if (!apiKey) {
    console.error("[forex-feed] CURRENCYFREAKS_API_KEY not set — real forex pairs will not update.");
    return null;
  }

  try {
    const res = await fetch(
      `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${apiKey}&symbols=EUR,GBP,JPY,CHF,AUD,CAD,KES,XAU,NZD,ZAR,SGD,HKD,MXN,INR,TRY,XAG,XPT,XPD`
    );
    if (!res.ok) throw new Error(`CurrencyFreaks returned ${res.status}`);
    const data = await res.json();
    const rates: Record<string, number> = {};
    for (const [k, v] of Object.entries(data.rates ?? {})) {
      rates[k] = parseFloat(v as string);
    }
    return rates;
  } catch (err) {
    console.error("[forex-feed] Failed to fetch real rates:", err);
    return null;
  }
}

async function refreshAnchors(markets: ForexMarket[]) {
  const rates = await fetchRealRates();
  if (!rates) return;

  if (rates.KES && isFinite(rates.KES)) {
    usdToKesRate = rates.KES;
  } else {
    console.error(
      "[forex-feed] CurrencyFreaks response did not include a usable KES rate " +
        "(check that your CurrencyFreaks plan includes KES) — deposits will keep " +
        "failing until this resolves or a fallback rate is set in payment_settings.",
      { received: rates.KES }
    );
  }

  for (const market of markets) {
    const derive = PAIR_DERIVATIONS[market.symbol];
    if (!derive) continue;
    try {
      const price = derive(rates);
      if (price && isFinite(price)) {
        anchorPrices.set(market.id, price);
      }
    } catch {
      // missing rate for this pair this cycle — keep previous anchor
    }
  }
  console.log("[forex-feed] Refreshed real rate anchors:", Object.fromEntries(anchorPrices));
}

export function startForexFeed() {
  let supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error("[forex-feed] not starting:", (err as Error).message);
    return;
  }

  async function tickMarket(market: ForexMarket) {
    const anchor = anchorPrices.get(market.id);
    if (!anchor) return; // haven't fetched a real rate yet

    const cfg = market.synthetic_config;
    const current = currentPrices.get(market.id) ?? anchor;

    // Smooth mean-reverting random walk: each tick takes a small random
    // step (using the full jitter_volatility as the step size — the
    // earlier version accidentally shrank this ~50x, which is why moves
    // were rounding to $0.00), pulled back toward the real anchor rate so
    // it never drifts far and re-anchors cleanly on the next real fetch.
    const reversionSpeed = 0.1;
    const randomStep = cfg.jitter_volatility * gaussianRandom();
    const reversion = (reversionSpeed * (anchor - current)) / anchor;
    const mid = current * (1 + randomStep + reversion);

    currentPrices.set(market.id, mid);

    const spreadPct = 0.00008;
    const spread = mid * spreadPct;
    const bid = mid - spread / 2;
    const ask = mid + spread / 2;

    const { error } = await supabase!.rpc("record_synthetic_tick", {
      p_market_id: market.id,
      p_bid: bid,
      p_ask: ask,
    });
    if (error) console.error(`[forex-feed] [${market.symbol}] tick failed:`, error.message);
  }

  async function boot() {
    const { data: markets, error } = await supabase!
      .from("markets")
      .select("id, symbol, synthetic_config")
      .eq("type", "forex_real")
      .eq("is_active", true);

    if (error) {
      console.error("[forex-feed] failed to load markets:", error.message);
    }

    const typedMarkets = (markets ?? []) as ForexMarket[];

    if (typedMarkets.length === 0) {
      console.warn("[forex-feed] no active forex_real markets found — still fetching USD/KES rate for deposits.");
      await refreshAnchors([]);
      setInterval(() => refreshAnchors([]), 3600000);
      return;
    }

    console.log(`[forex-feed] starting for ${typedMarkets.length} pair(s):`, typedMarkets.map((m) => m.symbol));

    await refreshAnchors(typedMarkets);
    const fetchInterval = typedMarkets[0]?.synthetic_config?.fetch_interval_ms ?? 3600000;
    setInterval(() => refreshAnchors(typedMarkets), fetchInterval);

    for (const market of typedMarkets) {
      setInterval(() => tickMarket(market), market.synthetic_config.tick_speed_ms);
    }
  }

  boot();
}
