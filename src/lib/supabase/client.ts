// src/lib/supabase/client.ts
"use client"; // Good practice for client-side utilities

import { createBrowserClient } from '@supabase/ssr';

export function createClientComponentClient() {
  console.log("[createClientComponentClient] Checking Supabase Env Vars:");
  console.log("[createClientComponentClient] NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log("[createClientComponentClient] NEXT_PUBLIC_SUPABASE_ANON_KEY:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "Supabase URL or Anon Key is missing in environment variables."
    );
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
