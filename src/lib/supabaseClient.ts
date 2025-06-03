// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

// Attempt to get from environment variables, or use hardcoded fallbacks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://qrcnmhdfsscmqwhbvjog.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyY25taGRmc3NjbXF3aGJ2am9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwMjUwMTMsImV4cCI6MjA2MTYwMTAxM30.F6PaY-dAyXRXU-RRpn-5l3KmmicjRRqoECvxWRX4h3A";

// Check if, even after potential fallback, the values are problematic
if (!supabaseUrl || !supabaseUrl.startsWith('https://')) {
  const message = "ERROR: NEXT_PUBLIC_SUPABASE_URL is undefined, empty, or invalid even after attempting to use a fallback. Original env var: " + process.env.NEXT_PUBLIC_SUPABASE_URL;
  console.error(message);
  throw new Error("Critical Configuration Error: Missing or invalid Supabase URL. If using fallbacks, ensure they are correct. Otherwise, check environment variable loading.");
}

if (!supabaseAnonKey || supabaseAnonKey.length < 100) { // Basic check for anon key format/length
  const message = "ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY is undefined, empty, or appears invalid even after attempting to use a fallback. Original env var provided: " + (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'yes' : 'no');
  console.error(message);
  throw new Error("Critical Configuration Error: Missing or invalid Supabase Anon Key. If using fallbacks, ensure they are correct. Otherwise, check environment variable loading.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
