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

  console.log(`[AuthRedirector] Rendering. Current state: isLoading=${isLoading}, isAuthenticated=${isAuthenticated}, role=${role}, userId=${user?.id}, pathname=${pathname}`);

  useEffect(() => {
    console.log(`[AuthRedirector][useEffect] Triggered. State: isLoading=${isLoading}, isAuthenticated=${isAuthenticated}, role=${role}, pathname=${pathname}`);
    
    if (isLoading) {
      console.log('[AuthRedirector][useEffect] Still loading auth state, no redirection decision yet.');
      return; 
    }

    // At this point, isLoading is false.
    console.log(`[AuthRedirector][useEffect] Auth state loaded. isAuthenticated=${isAuthenticated}, role=${role}`);

    if (isAuthenticated) {
      if (role) {
        // User authenticated and has a role
        if (pathname === "/" || pathname === "/role-selection") { 
          console.log(`[AuthRedirector][useEffect] User authenticated with role, currently on '${pathname}'. Redirecting to /dashboard.`);
          router.replace("/dashboard");
        } else {
          console.log(`[AuthRedirector][useEffect] User authenticated with role, currently on '${pathname}'. No redirection needed.`);
        }
      } else {
        // User authenticated WITHOUT a role
        if (pathname !== "/role-selection") { 
          console.log(`[AuthRedirector][useEffect] User authenticated without role, currently on '${pathname}'. Redirecting to /role-selection.`);
          router.replace("/role-selection");
        } else {
          console.log(`[AuthRedirector][useEffect] User authenticated without role, already on /role-selection. No redirection needed.`);
        }
      }
    } else {
      // User NOT authenticated
      if (pathname !== "/") { 
        console.log(`[AuthRedirector][useEffect] User not authenticated, currently on '${pathname}'. Redirecting to /.`);
        router.replace("/");
      } else {
        console.log(`[AuthRedirector][useEffect] User not authenticated, already on /. No redirection needed.`);
      }
    }
  }, [isAuthenticated, role, isLoading, router, pathname]);

  // Determine if skeleton should be shown
  // Show skeleton if:
  // 1. Auth state is still loading OR
  // 2. Auth state is loaded, but a redirect is imminent based on current conditions
  let needsRedirect = false;
  if (!isLoading) { // Only evaluate redirect need if auth state is resolved
    if (isAuthenticated) {
      if (role) {
        if (pathname === "/" || pathname === "/role-selection") needsRedirect = true;
      } else {
        if (pathname !== "/role-selection") needsRedirect = true;
      }
    } else {
      if (pathname !== "/") needsRedirect = true;
    }
  }

  const showSkeleton = isLoading || needsRedirect;

  if (showSkeleton) {
    console.log(`[AuthRedirector] Showing skeleton. isLoading=${isLoading}, needsRedirect=${needsRedirect} (based on isAuthenticated=${isAuthenticated}, role=${role}, pathname=${pathname})`);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Skeleton className="h-12 w-12 rounded-full mb-4" />
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
        <p className="text-muted-foreground mt-2">Cargando aplicación...</p>
      </div>
    );
  }
  
  console.log(`[AuthRedirector] Not showing skeleton (isLoading=${isLoading}, needsRedirect=${needsRedirect}), rendering children for pathname: ${pathname}`);
  return <>{children}</>;
}
