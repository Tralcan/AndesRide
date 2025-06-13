// src/app/role-selection/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { ROLES, Role as RoleType } from "@/lib/constants";
import { Car, User, LogOut, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function RoleSelectionPage() {
  const authHook = useAuth(); // Get the whole context object
  const { user, setRole, isLoading: authIsLoading, logout, isAuthenticated, role: contextRole } = authHook;
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmittingRole, setIsSubmittingRole] = useState(false); 

  // Log all relevant auth state from context at the beginning of every render
  console.log(
    `[RoleSelectionPage] Rendering. AuthContext State: 
    authIsLoading=${authIsLoading}, 
    isAuthenticated=${isAuthenticated}, 
    user exists=${!!user}, 
    user ID=${user?.id},
    user email=${user?.email},
    user profile exists=${!!user?.profile},
    contextRole=${contextRole}`
  );


  useEffect(() => {
    // This useEffect primarily handles redirection if the user lands here inappropriately
    // For example, if they are not authenticated, or if they already have a role.
    console.log(`[RoleSelectionPage][useEffect] Checking auth state. authIsLoading=${authIsLoading}, isAuthenticated=${isAuthenticated}, contextRole=${contextRole}`);
    if (!authIsLoading) {
      if (!isAuthenticated) {
        console.log("[RoleSelectionPage][useEffect] User not authenticated, redirecting to /");
        router.replace("/");
      } else if (contextRole) {
        // If user is authenticated and ALREADY has a role, they shouldn't be here.
        // AuthRedirector should ideally catch this, but this is a safeguard.
        console.log(`[RoleSelectionPage][useEffect] User authenticated and already has role '${contextRole}', redirecting to /dashboard`);
        router.replace("/dashboard");
      }
      // If authenticated and no role, they are on the correct page.
    }
  }, [authIsLoading, isAuthenticated, contextRole, router]);

  // Skeleton logic: Show skeleton if auth is loading AND we don't have user data yet (or if not authenticated which useEffect handles by redirecting)
  // If authIsLoading is true, but we have user data, it means we are likely in a transitional state (e.g. role being set).
  // The primary purpose of THIS skeleton is for the initial load of the page before AuthContext resolves.
  if (authIsLoading && !user) { 
    console.log("[RoleSelectionPage] Showing Skeleton because authIsLoading=true AND user is not yet available.");
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Skeleton className="h-12 w-12 rounded-full mb-4" />
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
        <p className="text-muted-foreground mt-4">Cargando selección de rol...</p>
      </div>
    );
  }
  
  const handleSetRole = async (selectedRole: RoleType) => {
    console.log(`[RoleSelectionPage] User ${user?.id} attempting to set role: ${selectedRole}`);
    if (!selectedRole) {
        console.warn("[RoleSelectionPage] No role selected or invalid role.");
        toast({ title: "Error de Selección", description: "No se seleccionó un rol válido.", variant: "destructive" });
        return;
    }
    setIsSubmittingRole(true); // UI feedback for submission process
    try {
      await setRole(selectedRole);
      console.log(`[RoleSelectionPage] setRole(${selectedRole}) promise resolved. AuthContext should handle navigation/further state updates.`);
      // Navigation to /dashboard is now handled within setRole in AuthContext upon success.
    } catch (error: any) {
        console.error("[RoleSelectionPage] Error calling setRole from page:", error);
        toast({ 
            title: "Error al Procesar Rol", 
            description: error.message || "Ocurrió un error al intentar establecer el rol.", 
            variant: "destructive" 
        });
    } finally {
        // It's important to set isSubmittingRole back to false,
        // even if navigation happens, in case the user navigates back or the component doesn't unmount immediately.
        setIsSubmittingRole(false); 
    }
  };

  const displayName = user?.profile?.fullName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Usuario";

  // Fallback if somehow user is null after loading state (should be caught by useEffect redirect)
  if (!user && !authIsLoading) {
     console.error("[RoleSelectionPage] Render condition: User is null AND auth is NOT loading. This shouldn't happen due to useEffect redirect. Showing minimal loading.");
     return <div className="flex justify-center items-center min-h-screen"><p>Cargando...</p></div>;
  }


  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-secondary p-6">
      <div className="absolute top-6 right-6">
        <Button variant="ghost" onClick={logout} aria-label="Cerrar sesión" disabled={authIsLoading || isSubmittingRole}>
          <LogOut className="mr-2 h-5 w-5" /> Cerrar Sesión
        </Button>
      </div>
      <div className="w-full max-w-lg text-center">
        <Logo size="lg" className="justify-center mb-6" />
        <h1 className="text-3xl font-bold text-foreground mb-2">Elige Tu Rol</h1>
        <p className="text-muted-foreground mb-8">
          ¡Hola {displayName}! ¿Cómo usarás AndesRide hoy?
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card 
            className="hover:shadow-xl transition-shadow cursor-pointer hover:border-primary"
            onClick={() => !(authIsLoading || isSubmittingRole) && handleSetRole(ROLES.DRIVER)}
            tabIndex={(authIsLoading || isSubmittingRole) ? -1 : 0}
            onKeyPress={(e) => e.key === 'Enter' && !(authIsLoading || isSubmittingRole) && handleSetRole(ROLES.DRIVER)}
            aria-label="Seleccionar Rol de Conductor"
            aria-disabled={authIsLoading || isSubmittingRole}
          >
            <CardHeader className="items-center">
              {(authIsLoading && !isSubmittingRole) || isSubmittingRole ? <Loader2 className="h-12 w-12 text-primary mb-2 animate-spin" /> : <Car className="h-12 w-12 text-primary mb-2" />}
              <CardTitle className="text-2xl">Soy Conductor</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Ofrece viajes, gestiona tus rutas y conecta con pasajeros.
              </CardDescription>
            </CardContent>
          </Card>

          <Card 
            className="hover:shadow-xl transition-shadow cursor-pointer hover:border-primary"
            onClick={() => !(authIsLoading || isSubmittingRole) && handleSetRole(ROLES.PASSENGER)}
            tabIndex={(authIsLoading || isSubmittingRole) ? -1 : 0}
            onKeyPress={(e) => e.key === 'Enter' && !(authIsLoading || isSubmittingRole) && handleSetRole(ROLES.PASSENGER)}
            aria-label="Seleccionar Rol de Pasajero"
            aria-disabled={authIsLoading || isSubmittingRole}
          >
            <CardHeader className="items-center">
               {(authIsLoading && !isSubmittingRole) || isSubmittingRole ? <Loader2 className="h-12 w-12 text-primary mb-2 animate-spin" /> : <User className="h-12 w-12 text-primary mb-2" />}
              <CardTitle className="text-2xl">Soy Pasajero</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Encuentra viajes, solicita asientos y viaja cómodamente.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
       <footer className="mt-12 text-center text-muted-foreground text-sm">
          © {new Date().getFullYear()} AndesRide. Todos los derechos reservados.
        </footer>
    </main>
  );
}
