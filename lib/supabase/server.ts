import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase client for server components and route handlers.
 *
 * Uses the ANON key, so every query is subject to row level security. That is
 * the point: the questions_read_reviewed policy means an unreviewed question is
 * invisible here even if a query forgets to filter. The service role key is for
 * scripts/import.ts only and must never be read by anything in app/.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component, where cookies are read-only.
            // Session refresh happens in middleware, so this is safe to ignore.
          }
        },
      },
    },
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to .env.local locally, and to the project's ` +
        `environment variables in Vercel before deploying.`,
    );
  }
  return value;
}

/** True when Supabase is configured at all, so pages can degrade instead of crashing. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
