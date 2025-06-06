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

  console.log('[AuthRedirector] Rendering. Auth state from useAuth():', { isAuthenticated, role, isLoading, userId: user?.id, pathname });

  useEffect(() => {
    console.log('[AuthRedirector] useEffect triggered. Auth state:', { isAuthenticated, role, isLoading, pathname });
    if (!isLoading) {
      if (isAuthenticated) {
        if (role) {
          // Usuario autenticado y con rol
          if (pathname === "/" || pathname === "/role-selection") { 
            console.log(`[AuthRedirector] User authenticated with role, on ${pathname}. Redirecting to /dashboard.`);
            router.replace("/dashboard");
          }
        } else {
          // Usuario autenticado SIN rol
          if (pathname !== "/role-selection") { 
            console.log(`[AuthRedirector] User authenticated without role, on ${pathname}. Redirecting to /role-selection.`);
            router.replace("/role-selection");
          }
        }
      } else {
        // Usuario NO autenticado
        if (pathname !== "/") { 
            console.log(`[AuthRedirector] User not authenticated, on ${pathname}. Redirecting to /.`);
            router.replace("/");
        }
      }
    }
  }, [isAuthenticated, role, isLoading, router, pathname]);

  // Determine if skeleton should be shown
  // Show skeleton if:
  // 1. Auth state is loading OR
  // 2. User is authenticated with a role but is on the login page (will be redirected to dashboard) OR
  // 3. User is authenticated without a role but is on the login page (will be redirected to role-selection) OR
  // 4. User is not authenticated but is on the role-selection page (will be redirected to login)
  const isRedirecting = 
    (isAuthenticated && role && (pathname === "/" || pathname === "/role-selection")) ||
    (isAuthenticated && !role && pathname !== "/role-selection") ||
    (!isAuthenticated && pathname !== "/");

  const showSkeleton = isLoading || isRedirecting;

  if (showSkeleton) {
    console.log('[AuthRedirector] Showing skeleton. Auth state:', { isAuthenticated, role, isLoading, pathname, isRedirecting });
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Skeleton className="h-12 w-12 rounded-full mb-4" />
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
        <p className="text-muted-foreground mt-2">Cargando aplicación...</p>
      </div>
    );
  }
  
  console.log('[AuthRedirector] Not showing skeleton, rendering children. Auth state:', { isAuthenticated, role, isLoading, pathname, isRedirecting });
  return <>{children}</>;
}

