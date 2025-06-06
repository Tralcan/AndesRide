// src/lib/supabase/server.ts
"use server"; // Ensure this runs on the server

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers'; // This is fine here because of "use server"

function checkServerEnvVars(context: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // These console.logs will appear in the SERVER console
  console.log(`[${context}] Checking Supabase Server Env Vars:`);
  console.log(`[${context}] NEXT_PUBLIC_SUPABASE_URL (read as):`, supabaseUrl);
  console.log(`[${context}] NEXT_PUBLIC_SUPABASE_ANON_KEY (read as):`, supabaseAnonKey);

  if (!supabaseUrl || !supabaseAnonKey) {
    const urlFound = supabaseUrl ? "found" : "MISSING or empty";
    const keyFound = supabaseAnonKey ? "found" : "MISSING or empty";
    console.error(`[${context}] Supabase URL is ${urlFound}, Anon Key is ${keyFound}. Both are required.`);
    throw new Error(
      `Supabase URL or Anon Key is missing in server environment variables for ${context}. URL: ${supabaseUrl}, Key: ${supabaseAnonKey}`
    );
  }
  return { supabaseUrl, supabaseAnonKey };
}


export function createServerActionClient() {
  const { supabaseUrl, supabaseAnonKey } = checkServerEnvVars("createServerActionClient");
  const cookieStore = cookies();
  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}

// This function is also for server contexts (Route Handlers)
export function createRouteHandlerClient(passedCookieStore: ReturnType<typeof cookies>) {
    const { supabaseUrl, supabaseAnonKey } = checkServerEnvVars("createRouteHandlerClient");
    return createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                get(name: string) {
                    return passedCookieStore.get(name)?.value;
                },
                set(name: string, value: string, options: CookieOptions) {
                    try {
                        passedCookieStore.set({ name, value, ...options });
                    } catch (error) { 
                        // The `set` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing user sessions.
                    }
                },
                remove(name: string, options: CookieOptions) {
                    try {
                        passedCookieStore.set({ name, value: '', ...options });
                    } catch (error) { 
                        // The `delete` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing user sessions.
                    }
                },
            },
        }
    );
}
