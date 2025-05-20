// src/app/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { AuthRedirector } from "@/components/auth/AuthRedirector";
import { useAuth } from "@/hooks/useAuth";
import { Chrome } from "lucide-react"; // Using Chrome icon as a generic "Google" icon

export default function LoginPage() {
  const { login, isLoading } = useAuth();

  return (
    <AuthRedirector>
      <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-secondary p-6 sm:p-8">
        <div className="w-full max-w-md bg-card p-8 sm:p-10 rounded-xl shadow-2xl text-center">
          <Logo size="lg" className="justify-center mb-8" />
          
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Welcome to AndesRide
          </h1>
          <p className="text-muted-foreground mb-10 text-base sm:text-lg">
            Your trusted companion for journeys through the mountains and beyond.
          </p>
          
          <Button 
            onClick={login} 
            disabled={isLoading}
            size="lg" 
            className="w-full text-lg py-7 rounded-lg shadow-md hover:shadow-lg transition-shadow"
            aria-label="Sign in with Google"
          >
            <Chrome className="mr-3 h-6 w-6" />
            {isLoading ? "Signing in..." : "Sign in with Google"}
          </Button>

          <p className="mt-8 text-sm text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
        <footer className="mt-12 text-center text-muted-foreground text-sm">
          © {new Date().getFullYear()} AndesRide. All rights reserved.
        </footer>
      </main>
    </AuthRedirector>
  );
}
