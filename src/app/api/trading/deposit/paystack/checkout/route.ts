// src/app/api/trading/deposit/paystack/checkout/route.ts
//
// Card / Pesalink bank transfer (and Apple Pay, which Paystack surfaces
// automatically within the card popup on supported Safari/iOS devices — no
// separate integration needed) deposits via Paystack's transaction/initialize
// endpoint, called directly. Same USD-in, KES-out conversion as the M-Pesa
// route — see that file's header comment for why.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { initiateCheckout } from "@/lib/paystack/client";
import { getUsdToKesDepositRate } from "@/lib/trading/deposit-rate";

const MIN_DEPOSIT_USD = 10;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const amountUsd = Number(body.amount);
  const checkoutMethod: "card" | "bank" = body.method === "bank" ? "bank" : "card";
  const currency = "USD";

  if (!amountUsd || amountUsd < MIN_DEPOSIT_USD) {
    return NextResponse.json({ error: `Minimum deposit is $${MIN_DEPOSIT_USD}` }, { status: 400 });
  }
  if (!user.email) {
    return NextResponse.json({ error: "An email on your account is required for card/bank checkout" }, { status: 400 });
  }

  const admin = createAdminClient();

  const rate = await getUsdToKesDepositRate(admin);
  if (!rate) {
    return NextResponse.json(
      { error: "Deposits are temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }
  const amountKes = Math.round(amountUsd * rate * 100) / 100;

  let { data: wallet } = await admin
    .from("wallets")
    .select("id")
    .eq("user_id", user.id)
    .eq("currency", currency)
    .eq("is_demo", false)
    .maybeSingle();

  if (!wallet) {
    const { data: newWallet, error: createErr } = await admin
      .from("wallets")
      .insert({ user_id: user.id, currency, balance: 0, is_demo: false })
      .select("id")
      .single();
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    wallet = newWallet;
  }

  const { data: txn, error: txnErr } = await admin
    .from("transactions")
    .insert({
      user_id: user.id,
      wallet_id: wallet.id,
      type: "deposit",
      status: "pending",
      amount: amountUsd,
      currency,
    })
    .select("id")
    .single();

  if (txnErr) return NextResponse.json({ error: txnErr.message }, { status: 500 });

  const { data: deposit, error: depositErr } = await admin
    .from("deposits")
    .insert({
      transaction_id: txn.id,
      user_id: user.id,
      provider: "paystack",
      payment_method: checkoutMethod,
      amount: amountUsd,
      currency,
      status: "pending",
      raw_callback: { amount_kes_charged: amountKes, conversion_rate: rate },
    })
    .select("id")
    .single();

  if (depositErr) return NextResponse.json({ error: depositErr.message }, { status: 500 });

  try {
    // Paystack references only allow `-`, `.`, `=` and alphanumerics —
    // deposit.id (a UUID) already satisfies that, so it doubles as both
    // our own row id and the reference the webhook will look it up by.
    const result = await initiateCheckout({
      method: checkoutMethod,
      amountKes,
      reference: deposit.id,
      email: user.email,
    });

    await admin.from("deposits").update({ provider_tracking_id: result.reference }).eq("id", deposit.id);

    return NextResponse.json({
      depositId: deposit.id,
      authorizationUrl: result.authorization_url,
      accessCode: result.access_code,
      amountKes,
    });
  } catch (err) {
    await admin.from("deposits").update({ status: "failed" }).eq("id", deposit.id);
    console.error("[paystack-checkout] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Paystack request failed" },
      { status: 502 }
    );
  }
}
