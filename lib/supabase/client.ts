"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for client components. Anon key only - it is compiled into
 * the browser bundle, which is safe precisely because row level security
 * decides what it can see.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
