// src/components/auth/AuthRedirector.tsx
"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter, usePathname } from "next/navigation"; 
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthRedirector({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, role, isLoading, user } = useAuth(); 
  const router = useRouter();
  const pathname = usePathname(); 

  console.log('[AuthRedirector] Rendering. Auth state:', { isAuthenticated, role, isLoading, userId: user?.id, pathname });

  useEffect(() => {
    console.log('[AuthRedirector] useEffect triggered. isLoading:', isLoading, 'isAuthenticated:', isAuthenticated, 'role:', role, 'pathname:', pathname);
    if (isLoading) {
      console.log('[AuthRedirector] Still loading auth state, no redirection yet.');
      return; // Espera a que el estado de autenticación se resuelva
    }

    if (isAuthenticated) {
      if (role) {
        // Usuario autenticado y con rol
        if (pathname === "/" || pathname === "/role-selection") { 
          console.log(`[AuthRedirector] User authenticated with role, on '${pathname}'. Redirecting to /dashboard.`);
          router.replace("/dashboard");
        } else {
          console.log(`[AuthRedirector] User authenticated with role, on '${pathname}'. No redirection needed.`);
        }
      } else {
        // Usuario autenticado SIN rol
        if (pathname !== "/role-selection") { 
          console.log(`[AuthRedirector] User authenticated without role, on '${pathname}'. Redirecting to /role-selection.`);
          router.replace("/role-selection");
        } else {
          console.log(`[AuthRedirector] User authenticated without role, already on /role-selection. No redirection needed.`);
        }
      }
    } else {
      // Usuario NO autenticado
      if (pathname !== "/") { 
        console.log(`[AuthRedirector] User not authenticated, on '${pathname}'. Redirecting to /.`);
        router.replace("/");
      } else {
        console.log(`[AuthRedirector] User not authenticated, already on /. No redirection needed.`);
      }
    }
  }, [isAuthenticated, role, isLoading, router, pathname]);

  // Muestra el skeleton si isLoading es true, o si está en proceso de redirección
  const isRedirecting = !isLoading && (
    (isAuthenticated && role && (pathname === "/" || pathname === "/role-selection")) ||
    (isAuthenticated && !role && pathname !== "/role-selection") ||
    (!isAuthenticated && pathname !== "/")
  );
  
  const showSkeleton = isLoading || isRedirecting;

  if (showSkeleton) {
    console.log('[AuthRedirector] Showing skeleton. isLoading:', isLoading, 'isRedirecting:', isRedirecting);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Skeleton className="h-12 w-12 rounded-full mb-4" />
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
        <p className="text-muted-foreground mt-2">Cargando aplicación...</p>
      </div>
    );
  }
  
  console.log('[AuthRedirector] Not showing skeleton, rendering children.');
  return <>{children}</>;
}
