// src/instrumentation.ts
//
// Next.js runs `register()` once, automatically, when the server process
// boots — before it starts handling requests. This starts the synthetic
// price engine, the real-forex rate feed, and the tick pruner as
// background loops inside this app's own process.
//
// IMPORTANT: only ONE deployed service should run these. If the Funhouse
// app is also still running its own copy, both will write ticks to the
// same market_prices table — doubling tick volume and egress. Remove
// instrumentation.ts (or its price-engine calls) from Funhouse when this
// service goes live.
//
// This only runs in the Node.js runtime (not the Edge runtime, not the
// browser), and only once per server instance.
//
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Avoid double-starting during Next.js dev mode hot-reloads.
  const g = globalThis as unknown as { __fxsSyntheticEngineStarted?: boolean };
  if (g.__fxsSyntheticEngineStarted) return;
  g.__fxsSyntheticEngineStarted = true;

  const { startSyntheticEngine } = await import("./lib/trading/synthetic-engine");
  startSyntheticEngine();

  const { startForexFeed } = await import("./lib/trading/forex-feed");
  startForexFeed();

  const { startTickPruner } = await import("./lib/trading/tick-pruner");
  startTickPruner();
}
