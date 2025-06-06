// src/app/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { AuthRedirector } from "@/components/auth/AuthRedirector";
import { AuthErrorAlert } from "@/components/auth/AuthErrorAlert"; // Import the new component
import { useAuth } from "@/hooks/useAuth";
import { Chrome } from "lucide-react"; 
import { useToast } from "@/hooks/use-toast";
import { Suspense } from "react"; // Import Suspense
import { Skeleton } from "@/components/ui/skeleton"; // For fallback

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const { toast } = useToast();
  // useSearchParams and related useEffect are moved to AuthErrorAlert

  const handleLogin = async () => {
    const { error } = await login();
    if (error) {
      toast({
        title: "Error de inicio de sesión",
        description: error.message || "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  };

  return (
    <AuthRedirector>
      <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-secondary p-6 sm:p-8">
        <div className="w-full max-w-md bg-card p-8 sm:p-10 rounded-xl shadow-2xl text-center">
          <Logo size="lg" className="justify-center mb-8" />
          
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Bienvenido a AndesRide
          </h1>
          <p className="text-muted-foreground mb-6 text-base sm:text-lg">
            Tu compañero de confianza para viajes a través de las montañas y más allá.
          </p>
          
          <Suspense fallback={<Skeleton className="h-20 w-full mb-6" />}>
            <AuthErrorAlert />
          </Suspense>
          
          <Button 
            onClick={handleLogin} 
            disabled={isLoading}
            size="lg" 
            className="w-full text-lg py-7 rounded-lg shadow-md hover:shadow-lg transition-shadow"
            aria-label="Iniciar sesión con Google"
          >
            <Chrome className="mr-3 h-6 w-6" />
            {isLoading ? "Iniciando sesión..." : "Iniciar sesión con Google"}
          </Button>

          <p className="mt-8 text-sm text-muted-foreground">
            Al iniciar sesión, aceptas nuestros Términos de Servicio y Política de Privacidad.
          </p>
        </div>
        <footer className="mt-12 text-center text-muted-foreground text-sm">
          © {new Date().getFullYear()} AndesRide. Todos los derechos reservados.
        </footer>
      </main>
    </AuthRedirector>
  );
}
