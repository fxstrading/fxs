// src/app/api/trading/deposit/paystack/mpesa/route.ts
//
// Triggers a real M-Pesa STK push via Paystack's Charge API directly. The
// customer sees and requests a USD amount (matching the currency the
// trading wallet and engine actually use — margin/P/L math is hardcoded to
// USD elsewhere). We convert to KES ourselves using the live rate from
// forex-feed.ts before calling Paystack, since M-Pesa itself only ever
// settles in KES. Our own deposits/transactions rows stay in USD, so
// confirm_deposit() credits the same USD wallet trading actually reads
// from.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { initiateStkPush } from "@/lib/paystack/client";
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
  const phone: string = body.phone;
  const currency = "USD";

  if (!amountUsd || amountUsd < MIN_DEPOSIT_USD) {
    return NextResponse.json({ error: `Minimum deposit is $${MIN_DEPOSIT_USD}` }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
  }
  if (!user.email) {
    return NextResponse.json({ error: "An email on your account is required for M-Pesa deposits" }, { status: 400 });
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
      payment_method: "mpesa_stk",
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
    const result = await initiateStkPush({
      phone,
      amountKes,
      reference: deposit.id,
      email: user.email,
    });

    if (result.status === "failed") {
      await admin.from("deposits").update({ status: "failed" }).eq("id", deposit.id);
      return NextResponse.json({ error: "M-Pesa declined the request. Please try again." }, { status: 502 });
    }

    await admin.from("deposits").update({ provider_tracking_id: result.reference }).eq("id", deposit.id);

    return NextResponse.json({
      message: result.display_text ?? "Enter your M-Pesa PIN on the prompt sent to your phone to complete the deposit.",
      depositId: deposit.id,
      amountKes,
    });
  } catch (err) {
    await admin.from("deposits").update({ status: "failed" }).eq("id", deposit.id);
    console.error("[paystack-mpesa] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Paystack request failed" },
      { status: 502 }
    );
  }
}
