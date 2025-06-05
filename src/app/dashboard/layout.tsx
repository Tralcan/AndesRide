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
  const { isAuthenticated, isLoading, role } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.replace("/");
      } else if (!role) {
        router.replace("/role-selection");
      }
    }
  }, [isAuthenticated, isLoading, role, router]);

  if (isLoading || !isAuthenticated || !role) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Skeleton className="h-12 w-12 rounded-full mb-4" />
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      {/* Main container is flex (row by default), h-screen, overflow-hidden */}
      <div className="flex h-screen w-full bg-muted/40 overflow-hidden">
        <AppSidebar />
        {/* This div wraps the main content area (header + scrollable content) */}
        {/* It's a flex item that grows (flex-1) and manages its own overflow. */}
        <div className="flex flex-col flex-1"> {/* REMOVED overflow-hidden */}
          <AppHeader />
          <SidebarInset> {/* SidebarInset now renders a div */}
            <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto">
              {children}
            </main>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
