// src/lib/trading/phone.ts
//
// Normalizes Kenyan mobile numbers to the +254XXXXXXXXX format Paystack's
// M-Pesa charge API expects. Users type numbers in whatever format they're
// used to seeing on their own phone — this accepts the common ones:
//
//   0723083524     (local format, leading 0)
//   723083524      (no leading 0 at all)
//   254723083524   (country code, no +)
//   +254723083524  (already correct)
//
// Returns null if the input doesn't reduce to a plausible Kenyan mobile
// number (9 digits after the country code, starting with 7 or 1 — Safaricom/
// Airtel/Telkom ranges), so callers can reject bad input with a clear error
// instead of silently sending garbage to Paystack.

export function normalizeKenyanPhone(input: string): string | null {
  if (!input) return null;

  // Strip everything except digits (handles spaces, dashes, a leading +).
  let digits = input.replace(/\D/g, "");

  // 0723083524 -> 723083524
  if (digits.startsWith("0") && digits.length === 10) {
    digits = digits.slice(1);
  }

  // 254723083524 -> 723083524
  if (digits.startsWith("254") && digits.length === 12) {
    digits = digits.slice(3);
  }

  // At this point `digits` should be exactly 9 digits: 7XXXXXXXX or 1XXXXXXXX
  // (Safaricom/Airtel/Telkom mobile ranges both start with 7; Safaricom's
  // newer 01... range starts with 1).
  if (!/^[17]\d{8}$/.test(digits)) {
    return null;
  }

  return `+254${digits}`;
}
