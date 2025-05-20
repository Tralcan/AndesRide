// src/app/role-selection/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { ROLES } from "@/lib/constants";
import { Car, User, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RoleSelectionPage() {
  const { user, role, setRole, isLoading, logout, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/"); // Redirect to login if not authenticated
    }
    if (!isLoading && isAuthenticated && role) {
      router.replace("/dashboard"); // Redirect to dashboard if role already set
    }
  }, [isLoading, isAuthenticated, role, router]);

  if (isLoading || !isAuthenticated || role) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-secondary p-6">
      <div className="absolute top-6 right-6">
        <Button variant="ghost" onClick={logout} aria-label="Logout">
          <LogOut className="mr-2 h-5 w-5" /> Logout
        </Button>
      </div>
      <div className="w-full max-w-lg text-center">
        <Logo size="lg" className="justify-center mb-6" />
        <h1 className="text-3xl font-bold text-foreground mb-2">Choose Your Role</h1>
        <p className="text-muted-foreground mb-8">
          Hi {user?.name}! How will you be using AndesRide today?
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card 
            className="hover:shadow-xl transition-shadow cursor-pointer hover:border-primary"
            onClick={() => setRole(ROLES.DRIVER)}
            tabIndex={0}
            onKeyPress={(e) => e.key === 'Enter' && setRole(ROLES.DRIVER)}
            aria-label="Select Driver Role"
          >
            <CardHeader className="items-center">
              <Car className="h-12 w-12 text-primary mb-2" />
              <CardTitle className="text-2xl">I'm a Driver</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Offer rides, manage your trips, and connect with passengers.
              </CardDescription>
            </CardContent>
          </Card>

          <Card 
            className="hover:shadow-xl transition-shadow cursor-pointer hover:border-primary"
            onClick={() => setRole(ROLES.PASSENGER)}
            tabIndex={0}
            onKeyPress={(e) => e.key === 'Enter' && setRole(ROLES.PASSENGER)}
            aria-label="Select Passenger Role"
          >
            <CardHeader className="items-center">
              <User className="h-12 w-12 text-primary mb-2" />
              <CardTitle className="text-2xl">I'm a Passenger</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Find rides, request seats, and travel conveniently.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
       <footer className="mt-12 text-center text-muted-foreground text-sm">
          © {new Date().getFullYear()} AndesRide. All rights reserved.
        </footer>
    </main>
  );
}
