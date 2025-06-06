// src/lib/supabase/client.ts
"use client"; // Good practice for client-side utilities

import { createBrowserClient } from '@supabase/ssr';

export function createClientComponentClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // This console.log should appear in the BROWSER console
  console.log("[createClientComponentClient] Checking Supabase Env Vars:");
  console.log("[createClientComponentClient] NEXT_PUBLIC_SUPABASE_URL (read as):", supabaseUrl);
  console.log("[createClientComponentClient] NEXT_PUBLIC_SUPABASE_ANON_KEY (read as):", supabaseAnonKey);

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      `Supabase URL or Anon Key is missing in environment variables. URL: ${supabaseUrl}, Key: ${supabaseAnonKey}`
    );
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
