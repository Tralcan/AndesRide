// src/app/auth/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: NextRequest) {
  const fullRequestUrl = request.url; // Capture the full URL
  console.log('[AuthCallback] Received request to /auth/callback. Full URL:', fullRequestUrl); // Log the full URL

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');
  const errorDescriptionParam = searchParams.get('error_description');

  // Si Google o Supabase devuelven un error directamente en los parámetros de la URL
  if (errorParam) {
    console.error(`[AuthCallback] Error received from OAuth provider: ${errorParam} - ${errorDescriptionParam || 'No description'}. Full URL: ${fullRequestUrl}`);
    const loginUrl = new URL(origin);
    loginUrl.searchParams.set('error', 'oauth_provider_error');
    loginUrl.searchParams.set('message', encodeURIComponent(errorDescriptionParam || errorParam));
    return NextResponse.redirect(loginUrl.toString());
  }

  if (code) {
    console.log('[AuthCallback] Authorization code found:', code, `Full URL: ${fullRequestUrl}`);
    try {
      const { error: exchangeError, data: sessionData } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error('[AuthCallback] Error exchanging code for session:', exchangeError.message, exchangeError, `Full URL: ${fullRequestUrl}`);
        const loginUrl = new URL(origin);
        loginUrl.searchParams.set('error', 'auth_callback_exchange_error');
        loginUrl.searchParams.set('message', encodeURIComponent(exchangeError.message));
        return NextResponse.redirect(loginUrl.toString());
      }

      if (sessionData?.session) {
        console.log('[AuthCallback] Code exchanged successfully, session obtained. Redirecting to origin:', origin, `Full URL: ${fullRequestUrl}`);
        return NextResponse.redirect(origin);
      } else {
        console.error(`[AuthCallback] Code exchanged but no session data received and no explicit error. Full URL: ${fullRequestUrl}`);
        const loginUrl = new URL(origin);
        loginUrl.searchParams.set('error', 'auth_callback_no_session');
        loginUrl.searchParams.set('message', encodeURIComponent('No se pudo establecer la sesión después del intercambio de código.'));
        return NextResponse.redirect(loginUrl.toString());
      }

    } catch (e: any) {
      console.error(`[AuthCallback] Catch-all exception during code exchange process: ${e}. Full URL: ${fullRequestUrl}`, e);
      const loginUrl = new URL(origin);
      loginUrl.searchParams.set('error', 'auth_callback_exception');
      loginUrl.searchParams.set('message', encodeURIComponent(e.message || 'Error desconocido durante el proceso de autenticación.'));
      return NextResponse.redirect(loginUrl.toString());
    }
  } else {
    console.error(`[AuthCallback] No code found in search params and no OAuth error param. Full URL: ${fullRequestUrl}`);
    const loginUrl = new URL(origin);
    loginUrl.searchParams.set('error', 'auth_callback_missing_code');
    loginUrl.searchParams.set('message', encodeURIComponent('No se recibió el código de autorización o información de error.'));
    return NextResponse.redirect(loginUrl.toString());
  }
}
