// src/lib/paystack/client.ts
//
// Direct client for Paystack's API (https://api.paystack.co) — replaces the
// FXS Pay middleman, which was itself just proxying to Paystack. Needs one
// env var on Render:
//
//   PAYSTACK_SECRET_KEY   your sk_live_... / sk_test_... secret key
//                         (Dashboard > Settings > API Keys & Webhooks)
//
// The same secret key is used to verify inbound webhook signatures — see
// src/app/api/trading/deposit/paystack-webhook/route.ts. There's no
// separate webhook secret to register like FXS Pay required; you just set
// the webhook URL once in the Paystack dashboard.
//
// Amounts: Paystack takes amounts in the subunit of the currency (i.e. the
// base amount * 100) — https://paystack.com/docs/api/#amounts. We deal in
// KES here (M-Pesa/Pesalink/card settle in KES), so a KES amount of 500
// becomes amount: "50000".

const BASE_URL = "https://api.paystack.co";

function authHeaders() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function toSubunit(amountMajor: number) {
  return String(Math.round(amountMajor * 100));
}

type PaystackChargeStatus =
  | "success"
  | "failed"
  | "pending"
  | "pay_offline"
  | "send_otp"
  | "send_pin"
  | "send_birthday"
  | "send_phone"
  | "send_address"
  | "abandoned"
  | string;

export async function initiateStkPush(params: {
  phone: string;
  amountKes: number;
  reference: string;
  email: string;
}) {
  const res = await fetch(`${BASE_URL}/charge`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      email: params.email,
      amount: toSubunit(params.amountKes),
      currency: "KES",
      reference: params.reference,
      mobile_money: {
        phone: params.phone,
        provider: "mpesa",
      },
    }),
  });

  const body = await res.json();
  if (!res.ok || body.status !== true) {
    throw new Error(`Paystack charge failed: ${res.status} ${JSON.stringify(body)}`);
  }

  return body.data as {
    status: PaystackChargeStatus;
    reference: string;
    display_text?: string;
    message?: string | null;
  };
}

export async function initiateCheckout(params: {
  method: "card" | "bank";
  amountKes: number;
  reference: string;
  email: string;
}) {
  const res = await fetch(`${BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      email: params.email,
      amount: toSubunit(params.amountKes),
      currency: "KES",
      reference: params.reference,
      channels: [params.method === "bank" ? "bank_transfer" : "card"],
    }),
  });

  const body = await res.json();
  if (!res.ok || body.status !== true) {
    throw new Error(`Paystack transaction/initialize failed: ${res.status} ${JSON.stringify(body)}`);
  }

  return body.data as {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export async function verifyTransaction(reference: string) {
  const res = await fetch(`${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: authHeaders(),
  });

  const body = await res.json();
  if (!res.ok || body.status !== true) {
    throw new Error(`Paystack verify failed: ${res.status} ${JSON.stringify(body)}`);
  }

  return body.data as {
    status: "success" | "failed" | "abandoned" | "pending" | string;
    reference: string;
    amount: number;
    currency: string;
  };
}
