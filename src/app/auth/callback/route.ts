// src/app/auth/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: NextRequest) {
  console.log('[AuthCallback] Received request to /auth/callback');
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');
  const errorDescriptionParam = searchParams.get('error_description');

  // Si Google o Supabase devuelven un error directamente en los parámetros de la URL
  if (errorParam) {
    console.error(`[AuthCallback] Error received from OAuth provider: ${errorParam} - ${errorDescriptionParam || 'No description'}`);
    const loginUrl = new URL(origin); // Asumimos que la página de login está en el origen
    loginUrl.searchParams.set('error', 'oauth_provider_error');
    loginUrl.searchParams.set('message', encodeURIComponent(errorDescriptionParam || errorParam));
    return NextResponse.redirect(loginUrl.toString());
  }

  if (code) {
    console.log('[AuthCallback] Authorization code found:', code);
    try {
      const { error: exchangeError, data: sessionData } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error('[AuthCallback] Error exchanging code for session:', exchangeError.message, exchangeError);
        const loginUrl = new URL(origin);
        loginUrl.searchParams.set('error', 'auth_callback_exchange_error');
        loginUrl.searchParams.set('message', encodeURIComponent(exchangeError.message));
        return NextResponse.redirect(loginUrl.toString());
      }

      if (sessionData?.session) {
        console.log('[AuthCallback] Code exchanged successfully, session obtained. Redirecting to origin:', origin);
        // Redirige al usuario a la página de inicio (que es `origin`).
        // AuthContext y AuthRedirector en la página de inicio se encargarán de la lógica
        // de redirigir a /dashboard o /role-selection.
        return NextResponse.redirect(origin);
      } else {
        // Esto es un caso inesperado si no hay error pero tampoco hay sesión.
        console.error('[AuthCallback] Code exchanged but no session data received and no explicit error.');
        const loginUrl = new URL(origin);
        loginUrl.searchParams.set('error', 'auth_callback_no_session');
        loginUrl.searchParams.set('message', encodeURIComponent('No se pudo establecer la sesión después del intercambio de código.'));
        return NextResponse.redirect(loginUrl.toString());
      }

    } catch (e: any) {
      console.error('[AuthCallback] Catch-all exception during code exchange process:', e);
      const loginUrl = new URL(origin);
      loginUrl.searchParams.set('error', 'auth_callback_exception');
      loginUrl.searchParams.set('message', encodeURIComponent(e.message || 'Error desconocido durante el proceso de autenticación.'));
      return NextResponse.redirect(loginUrl.toString());
    }
  } else {
    // No hay código y no hay error de OAuth directo, esto no debería suceder en un flujo normal.
    console.error('[AuthCallback] No code found in search params and no OAuth error param.');
    const loginUrl = new URL(origin);
    loginUrl.searchParams.set('error', 'auth_callback_missing_code');
    loginUrl.searchParams.set('message', encodeURIComponent('No se recibió el código de autorización o información de error.'));
    return NextResponse.redirect(loginUrl.toString());
  }
}
