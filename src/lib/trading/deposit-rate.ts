// src/lib/trading/deposit-rate.ts
//
// USD -> KES conversion rate used for deposits (card, Apple Pay, M-Pesa).
// This is intentionally OUR OWN rate, not fetched from any external FX
// provider — the client always enters and is shown a USD amount; this
// number is what our own code uses internally to work out how much KES to
// actually send to Paystack (which is what Safaricom/M-Pesa settles in).
//
// The rate lives in payment_settings (same table 018 created for paybill/
// bank details) under the key 'usd_kes_deposit_rate'. It's a plain value
// an admin updates directly in SQL — there is no live/automatic fetch, by
// design, so there's nothing here that can fail because a third-party API
// is down, rate-limited, or doesn't support KES on its plan.
//
// To update it:
//   update public.payment_settings set value = '150.25', updated_at = now()
//   where key = 'usd_kes_deposit_rate';
//
// Check a source like xe.com or your bank's rate periodically and keep
// this close to the real market rate — if it drifts too far, you either
// eat the difference or make it visibly wrong to users, depending on
// which side it drifts.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function getUsdToKesDepositRate(admin: SupabaseClient): Promise<number | null> {
  const { data, error } = await admin
    .from("payment_settings")
    .select("value")
    .eq("key", "usd_kes_deposit_rate")
    .maybeSingle();

  if (error) {
    console.error("[deposit-rate] failed to read usd_kes_deposit_rate:", error.message);
    return null;
  }

  const rate = data?.value ? Number(data.value) : NaN;
  return isFinite(rate) && rate > 0 ? rate : null;
}
