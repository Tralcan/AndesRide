// src/components/auth/AuthRedirector.tsx
"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter, usePathname } from "next/navigation"; // Import usePathname
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthRedirector({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, role, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname(); // Get current path

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        if (role) {
          // Usuario autenticado y con rol
          if (pathname === "/") { // Si está en la página de login, redirigir al dashboard
            console.log("[AuthRedirector] User authenticated with role, on login page. Redirecting to /dashboard.");
            router.replace("/dashboard");
          }
          // Si está en /role-selection, no hacer nada. Permitir que se quede para cambiar el rol.
        } else {
          // Usuario autenticado SIN rol
          if (pathname === "/") { // Si está en la página de login, redirigir a selección de rol
            console.log("[AuthRedirector] User authenticated without role, on login page. Redirecting to /role-selection.");
            router.replace("/role-selection");
          }
          // Si está en /role-selection y sin rol, debe estar ahí.
        }
      } else {
        // Usuario NO autenticado
        if (pathname === "/role-selection") { // Si está en la página de selección de rol pero no autenticado, ir a login
            console.log("[AuthRedirector] User not authenticated, on role-selection page. Redirecting to /.");
            router.replace("/");
        }
        // Si está en la página de login ('/') y no autenticado, debe estar ahí.
      }
    }
  }, [isAuthenticated, role, isLoading, router, pathname]);

  // Mostrar esqueleto de carga si todavía está cargando, O
  // si está autenticado y las condiciones para la redirección podrían seguir siendo verdaderas (esperando a que pathname se actualice)
  const showSkeleton = isLoading ||
    (isAuthenticated && role && pathname === "/") || // Se redirigirá de login a dashboard
    (isAuthenticated && !role && pathname === "/") || // Se redirigirá de login a role-selection
    (!isAuthenticated && pathname === "/role-selection"); // Se redirigirá de role-selection a login

  if (showSkeleton) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Skeleton className="h-12 w-12 rounded-full mb-4" />
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  return <>{children}</>;
}
