// src/app/role-selection/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { ROLES, Role as RoleType } from "@/lib/constants";
import { Car, User, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function RoleSelectionPage() {
  const { user, role, setRole, isLoading, logout, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        console.log("[RoleSelectionPage] User not authenticated, redirecting to /");
        router.replace("/");
      }
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading && !user) { 
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Skeleton className="h-12 w-12 rounded-full mb-4" />
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
        <p className="text-muted-foreground mt-4">Cargando...</p>
      </div>
    );
  }
  
  const handleSetRole = async (selectedRole: RoleType) => {
    console.log(`[RoleSelectionPage] User ${user?.id} attempting to set role: ${selectedRole}`);
    if (selectedRole) {
      await setRole(selectedRole);
      // La redirección es manejada dentro de setRole en AuthContext (o debería serlo)
      // Si no, se podría añadir un router.push("/dashboard") aquí, pero es mejor centralizarlo.
    } else {
      console.warn("[RoleSelectionPage] No role selected or invalid role.");
    }
  };

  // Prioritize existing profile name, then metadata, then email
  const displayName = user?.profile?.fullName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Usuario";

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-secondary p-6">
      <div className="absolute top-6 right-6">
        <Button variant="ghost" onClick={logout} aria-label="Cerrar sesión" disabled={isLoading}>
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
            onClick={() => handleSetRole(ROLES.DRIVER)}
            tabIndex={0}
            onKeyPress={(e) => e.key === 'Enter' && handleSetRole(ROLES.DRIVER)}
            aria-label="Seleccionar Rol de Conductor"
          >
            <CardHeader className="items-center">
              <Car className="h-12 w-12 text-primary mb-2" />
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
            onClick={() => handleSetRole(ROLES.PASSENGER)}
            tabIndex={0}
            onKeyPress={(e) => e.key === 'Enter' && handleSetRole(ROLES.PASSENGER)}
            aria-label="Seleccionar Rol de Pasajero"
          >
            <CardHeader className="items-center">
              <User className="h-12 w-12 text-primary mb-2" />
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
