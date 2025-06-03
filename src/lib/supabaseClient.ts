// src/lib/supabaseClient.ts
// Note: dotenv/config was removed. Next.js should automatically load .env files.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL is undefined. Ensure it's set in your .env file and the Next.js server has been restarted. This variable should be automatically loaded by Next.js.");
  throw new Error("Critical Configuration Error: Missing environment variable NEXT_PUBLIC_SUPABASE_URL. Please check your .env file and ensure the server/build process has been restarted.");
}
if (!supabaseAnonKey) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY is undefined. Ensure it's set in your .env file and the Next.js server has been restarted. This variable should be automatically loaded by Next.js.");
  throw new Error("Critical Configuration Error: Missing environment variable NEXT_PUBLIC_SUPABASE_ANON_KEY. Please check your .env file and ensure the server/build process has been restarted.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
