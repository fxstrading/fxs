# FXS Trading — Standalone App

Split out of the Funhouse repo into its own independently-deployable
Next.js app. Shares the same Supabase project as Funhouse (same accounts,
same database), but deploys and runs separately.

## Environment variables (Render)

```
NEXT_PUBLIC_SUPABASE_URL       same as Funhouse
NEXT_PUBLIC_SUPABASE_ANON_KEY  same as Funhouse
SUPABASE_SERVICE_ROLE_KEY      same as Funhouse
CURRENCYFREAKS_API_KEY         same as Funhouse
PAYSTACK_SECRET_KEY            your sk_live_... / sk_test_... secret key
```

## ⚠️ Two things that MUST be done when this goes live

**1. Stop the price engine in Funhouse.** This app now runs the synthetic
engine, forex feed, and tick pruner via `src/instrumentation.ts`. If
Funhouse also still runs them, BOTH will write ticks to the same
`market_prices` table — doubling tick volume and egress. Remove the
price-engine calls from Funhouse's `src/instrumentation.ts`.

**2. Point the Paystack webhook at this app's domain.** In the Paystack
dashboard, go to Settings > API Keys & Webhooks and set the webhook URL
(for both test and live mode — they're configured separately) to:

```
https://YOUR-DOMAIN.onrender.com/api/trading/deposit/paystack-webhook
```

Unlike FXS Pay, there's no separate secret to fetch and store — the
webhook signature is verified with the same `PAYSTACK_SECRET_KEY` used for
API calls.

## Also worth doing

- Add `FXS-Trading.apk` to `public/` (login/signup link to `/FXS-Trading.apk`)
- Add this app's domain to Google OAuth authorized origins, and
  `https://YOUR-PROJECT.supabase.co/auth/v1/callback` is already the
  redirect URI (unchanged — same Supabase project)
- Point Funhouse's menu "Trading" item at this app's URL instead of `/trading`
- Once verified working, delete the old `src/app/trading/` folder from Funhouse

## Routes

```
/                     landing
/login  /signup       auth
/dashboard            account home
/terminal             trading terminal
/deposit  /withdraw   funding
/kyc  /history        verification + trade history
/terms  /risk-disclosure
/admin/deposits  /admin/withdrawals  /admin/kyc
```
