import { createBrowserClient } from "@supabase/ssr";

// Module-level singleton. Every call to createClient() across the app
// returns the SAME client instance instead of spawning a brand-new one
// (and a brand-new realtime socket) on every component render. Without
// this, any component that calls createClient() directly in its render
// body — rather than memoizing it — tears down and recreates its
// realtime subscriptions on every re-render, which silently drops most
// incoming events (e.g. live price ticks).
let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
