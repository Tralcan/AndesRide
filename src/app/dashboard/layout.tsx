// src/app/dashboard/layout.tsx
"use client";

import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, role, user } = useAuth(); 
  const router = useRouter();

  console.log('[DashboardLayout] Rendering. Auth state:', { isAuthenticated, isLoading, role, userId: user?.id });

  useEffect(() => {
    console.log('[DashboardLayout] useEffect triggered. isLoading:', isLoading, 'isAuthenticated:', isAuthenticated, 'role:', role);
    if (!isLoading) {
      if (!isAuthenticated) {
        console.log('[DashboardLayout] Not authenticated, redirecting to /');
        router.replace("/");
      } else if (!role) {
        console.log('[DashboardLayout] Authenticated but no role, redirecting to /role-selection');
        router.replace("/role-selection");
      } else {
        console.log('[DashboardLayout] Authenticated with role, proceeding to render dashboard.');
      }
    }
  }, [isAuthenticated, isLoading, role, router]);

  if (isLoading || !isAuthenticated || !role) {
    console.log('[DashboardLayout] Showing skeleton loader. isLoading:', isLoading, 'isAuthenticated:', isAuthenticated, 'role:', role);
    // Si isLoading es true, es normal mostrar el skeleton.
    // Si isLoading es false pero no está autenticado o no tiene rol, el redirect debería ocurrir, 
    // pero el skeleton evita un flash de contenido no autorizado.
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Skeleton className="h-12 w-12 rounded-full mb-4" />
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
        <p className="text-muted-foreground mt-2">Cargando panel...</p>
      </div>
    );
  }
  
  console.log('[DashboardLayout] Rendering dashboard content because user is authenticated and has a role.');
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-muted/40 overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1"> 
          <AppHeader />
          <SidebarInset> 
            <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto">
              {children}
            </main>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
