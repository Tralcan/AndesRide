
// src/components/auth/AuthRedirector.tsx
"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthRedirector({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, role, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Refs para logging del estado actual dentro de useEffect
  const isLoadingRef = useRef(isLoading);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const roleRef = useRef(role);

  useEffect(() => {
    isLoadingRef.current = isLoading;
    isAuthenticatedRef.current = isAuthenticated;
    roleRef.current = role;
  });

  useEffect(() => {
    console.log(
      `[AuthRedirector][useEffect] Triggered. Pathname: ${pathname}. isLoading: ${isLoadingRef.current}, isAuthenticated: ${isAuthenticatedRef.current}, role: ${roleRef.current}, User ID: ${user?.id}`
    );

    if (isLoadingRef.current) {
      console.log('[AuthRedirector][useEffect] STILL LOADING auth state. No redirection decision yet.');
      return; // Espera a que el estado de autenticación se resuelva
    }

    // En este punto, isLoadingRef.current es false. El estado de autenticación se ha cargado.
    console.log(`[AuthRedirector][useEffect] Auth state LOADED. isAuthenticated: ${isAuthenticatedRef.current}, role: ${roleRef.current}, User ID: ${user?.id}`);

    if (isAuthenticatedRef.current) {
      if (roleRef.current) {
        // Usuario autenticado y con rol
        if (pathname === "/" || pathname === "/role-selection") {
          console.log(`[AuthRedirector][useEffect] User authenticated with role, on '${pathname}'. Redirecting to /dashboard.`);
          router.replace("/dashboard");
        } else {
          console.log(`[AuthRedirector][useEffect] User authenticated with role, on '${pathname}'. No redirection needed.`);
        }
      } else {
        // Usuario autenticado SIN rol
        if (pathname !== "/role-selection") {
          console.log(`[AuthRedirector][useEffect] User authenticated WITHOUT role, on '${pathname}'. Redirecting to /role-selection.`);
          router.replace("/role-selection");
        } else {
          console.log(`[AuthRedirector][useEffect] User authenticated WITHOUT role, already on /role-selection. No redirection needed.`);
        }
      }
    } else {
      // Usuario NO autenticado
      if (pathname !== "/") {
        console.log(`[AuthRedirector][useEffect] User NOT authenticated, on '${pathname}'. Redirecting to /.`);
        router.replace("/");
      } else {
        console.log(`[AuthRedirector][useEffect] User NOT authenticated, already on /. No redirection needed.`);
      }
    }
  }, [isAuthenticated, role, isLoading, router, pathname, user?.id]); // Dependencias originales

  // Mostrar el esqueleto SÓLO si AuthContext todavía está cargando su estado.
  if (isLoading) {
    console.log(`[AuthRedirector] Rendering SKELETON because isLoading from AuthContext is true. Pathname: ${pathname}`);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Skeleton className="h-12 w-12 rounded-full mb-4" />
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
        <p className="text-muted-foreground mt-2">Cargando aplicación...</p>
      </div>
    );
  }

  // Si no está cargando (isLoading es false), el useEffect anterior ya habrá manejado
  // cualquier redirección necesaria. En este punto, simplemente renderizamos los hijos.
  // Esto significa que si estamos en "/" y necesitamos ir a "/role-selection",
  // el redirector habrá disparado router.replace, y la página de /role-selection
  // se renderizará (que a su vez también puede usar AuthRedirector, pero el flujo debería ser correcto).
  console.log(`[AuthRedirector] NOT rendering SKELETON (isLoading is false). Pathname: ${pathname}. Rendering children.`);
  return <>{children}</>;
}
