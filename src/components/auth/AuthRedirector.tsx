// src/components/auth/AuthRedirector.tsx
"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthRedirector({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, role, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        if (role) {
          router.replace("/dashboard");
        } else {
          router.replace("/role-selection");
        }
      }
      // If not authenticated, stay on the current page (which should be the login page)
    }
  }, [isAuthenticated, role, isLoading, router]);

  if (isLoading || (isAuthenticated && (role ? true : router.pathname !== '/role-selection'))) {
    // Show a loading state or a blank page while redirecting or loading
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
