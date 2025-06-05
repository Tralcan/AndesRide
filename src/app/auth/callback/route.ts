// src/app/auth/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabaseClient'; // Asegúrate que esta sea la instancia correcta de Supabase admin o server client si fuera necesario para exchangeCodeForSession en otros contextos, aunque para App Router, el cliente importado debería funcionar.

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // const next = searchParams.get('next') ?? '/'; // Si quisieras redirigir a una ruta específica guardada antes del OAuth

  if (code) {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // Redirige al usuario a la página de inicio o al dashboard.
        // AuthRedirector se encargará de la lógica de a dónde ir después.
        console.log('[AuthCallback] Code exchanged successfully, redirecting to origin:', origin);
        return NextResponse.redirect(origin);
      }
      console.error('[AuthCallback] Error exchanging code for session:', error);
      // Podrías redirigir a una página de error específica
      return NextResponse.redirect(`${origin}/login?error=auth_callback_error&message=${encodeURIComponent(error.message)}`);
    } catch (e: any) {
      console.error('[AuthCallback] Catch exception exchanging code:', e);
      return NextResponse.redirect(`${origin}/login?error=auth_callback_exception&message=${encodeURIComponent(e.message || 'Unknown error')}`);
    }
  } else {
    console.error('[AuthCallback] No code found in search params.');
  }

  // Redirige a una página de error o de login si no hay código
  console.log('[AuthCallback] No code found, redirecting to login with error.');
  return NextResponse.redirect(`${origin}/login?error=auth_callback_missing_code`);
}
