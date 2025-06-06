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
  const { isAuthenticated, isLoading, role, user } = useAuth(); // Add user for logging
  const router = useRouter();

  console.log('[DashboardLayout] Rendering. Auth state from useAuth():', { isAuthenticated, isLoading, role, userId: user?.id });

  useEffect(() => {
    // This useEffect is primarily for enforcing auth on the dashboard.
    // The AuthRedirector handles more general redirection logic.
    console.log('[DashboardLayout] useEffect triggered. Auth state:', { isAuthenticated, isLoading, role });
    if (!isLoading) {
      if (!isAuthenticated) {
        console.log('[DashboardLayout] Not authenticated, redirecting to /');
        router.replace("/");
      } else if (!role) {
        console.log('[DashboardLayout] Authenticated but no role, redirecting to /role-selection');
        router.replace("/role-selection");
      }
    }
  }, [isAuthenticated, isLoading, role, router]);

  if (isLoading || !isAuthenticated || !role) {
    console.log('[DashboardLayout] Showing skeleton loader. Auth state:', { isAuthenticated, isLoading, role });
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Skeleton className="h-12 w-12 rounded-full mb-4" />
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
        <p className="text-muted-foreground mt-2">Cargando panel...</p>
      </div>
    );
  }
  
  console.log('[DashboardLayout] Rendering dashboard content. Auth state:', { isAuthenticated, isLoading, role });
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

