// src/app/api/trading/deposit/paystack-webhook/route.ts
//
// Paystack calls this directly (server-to-server) once a charge resolves.
// Set this URL once in the Paystack dashboard — Settings > API Keys &
// Webhooks — for both the test and live modes (they're configured
// separately). Unlike FXS Pay, there's no separate secret to register:
// the signature below is keyed with the same PAYSTACK_SECRET_KEY used for
// API calls.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTransaction } from "@/lib/paystack/client";

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  // Constant-time comparison to avoid timing attacks
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("[paystack-webhook] PAYSTACK_SECRET_KEY is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // Read the RAW body text — verifying against a re-parsed/re-stringified
  // object would silently fail on any whitespace/key-order difference.
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const eventType: string = payload.event;
  const reference: string | undefined = payload.data?.reference;

  // We only act on charge.success here — Paystack doesn't reliably push a
  // "charge failed" event, so failed/abandoned attempts are left "pending"
  // and just never get confirmed (the frontend's poll times out and shows
  // "try again"). Ack everything else so Paystack doesn't keep retrying.
  if (eventType !== "charge.success" || !reference) {
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();

  const { data: deposit } = await admin
    .from("deposits")
    .select("id, status, amount, raw_callback")
    .eq("provider_tracking_id", reference)
    .maybeSingle();

  if (!deposit) {
    console.error("[paystack-webhook] no matching deposit for reference:", reference);
    return NextResponse.json({ received: true }); // ack anyway, nothing to retry
  }

  // Idempotent — Paystack may redeliver the same event.
  if (deposit.status === "completed" || deposit.status === "failed") {
    return NextResponse.json({ received: true });
  }

  // Don't trust the webhook payload's amount/status alone — re-verify
  // server-to-server against Paystack before crediting the wallet.
  try {
    const verified = await verifyTransaction(reference);
    const amountKesExpected = deposit.raw_callback?.amount_kes_charged;

    if (verified.status !== "success") {
      console.error("[paystack-webhook] verify status mismatch:", reference, verified.status);
      return NextResponse.json({ received: true });
    }
    if (amountKesExpected && Math.round(verified.amount) !== Math.round(amountKesExpected * 100)) {
      console.error("[paystack-webhook] amount mismatch:", reference, verified.amount, amountKesExpected);
      return NextResponse.json({ received: true });
    }

    const { error } = await admin.rpc("confirm_deposit", { p_deposit_id: deposit.id });
    if (error) console.error("[paystack-webhook] confirm_deposit failed:", error.message);
  } catch (err) {
    console.error("[paystack-webhook] verify failed:", err);
  }

  return NextResponse.json({ received: true });
}
