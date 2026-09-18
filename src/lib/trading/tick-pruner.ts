// src/lib/trading/tick-pruner.ts
//
// Keeps market_prices from growing unbounded. This was originally meant to
// run via pg_cron, but that extension wasn't available in the dashboard —
// so instead it runs as one more scheduled task inside the same always-on
// Node process that already powers the synthetic engine and forex feed.
// No database-side scheduling needed at all.

import { createAdminClient } from "@/lib/supabase/admin";

const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // hourly

export function startTickPruner() {
  let supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error("[tick-pruner] not starting:", (err as Error).message);
    return;
  }

  async function prune() {
    const { error } = await supabase!.rpc("prune_old_ticks");
    if (error) {
      console.error("[tick-pruner] prune failed:", error.message);
    } else {
      console.log("[tick-pruner] pruned ticks older than 24 hours");
    }
  }

  // Run once shortly after boot, then hourly.
  setTimeout(prune, 60 * 1000);
  setInterval(prune, PRUNE_INTERVAL_MS);
}
