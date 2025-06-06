// src/lib/supabase/server.ts
"use server"; // Ensure this runs on the server

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers'; // This is fine here because of "use server"

function checkServerEnvVars(context: string) {
  console.log(`[${context}] Checking Supabase Server Env Vars:`);
  console.log(`[${context}] NEXT_PUBLIC_SUPABASE_URL:`, process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log(`[${context}] NEXT_PUBLIC_SUPABASE_ANON_KEY:`, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    // Log the actual values found to help debug if they are empty strings vs undefined
    const urlFound = process.env.NEXT_PUBLIC_SUPABASE_URL ? "found" : "MISSING or empty";
    const keyFound = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "found" : "MISSING or empty";
    console.error(`[${context}] Supabase URL is ${urlFound}, Anon Key is ${keyFound}. Both are required.`);
    throw new Error(
      `Supabase URL or Anon Key is missing in server environment variables for ${context}.`
    );
  }
}


export function createServerActionClient() {
  checkServerEnvVars("createServerActionClient");
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    checkServerEnvVars("createRouteHandlerClient");
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
