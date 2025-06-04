
// src/app/dashboard/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { APP_NAME, ROLES } from "@/lib/constants";
import { Car, User, PlusCircle, Search, ListChecks } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function DashboardPage() {
  const { user, role } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Buenos Días";
    if (hour < 18) return "Buenas Tardes";
    return "Buenas Noches";
  };

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-3xl font-bold text-primary">
                {getGreeting()}, {user?.profile?.fullName || user?.email}!
              </CardTitle>
              <CardDescription className="text-lg text-muted-foreground mt-1">
                Bienvenido de nuevo a {APP_NAME}. ¿Listo para tu próximo viaje?
              </CardDescription>
            </div>
            <div className="p-3 bg-primary/10 rounded-full">
              {role === ROLES.DRIVER ? (
                <Car className="h-10 w-10 text-primary" />
              ) : (
                <User className="h-10 w-10 text-primary" />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
           <Image
            src="https://placehold.co/1200x400.png"
            alt="Personas subiéndose a autos para un viaje compartido"
            width={1200}
            height={400}
            className="rounded-lg object-cover w-full"
            data-ai-hint="people cars"
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {role === ROLES.DRIVER && (
          <Card className="hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <PlusCircle className="h-6 w-6 text-accent" />
                Publicar un Nuevo Viaje
              </CardTitle>
              <CardDescription>
                Ofrece un viaje a otros viajeros. Define tu ruta, fecha y asientos disponibles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/dashboard/driver/publish-trip">Crear Viaje</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {role === ROLES.PASSENGER && (
          <Card className="hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Search className="h-6 w-6 text-accent" />
                Encontrar un Viaje
              </CardTitle>
              <CardDescription>
                Busca viajes disponibles según tu origen, destino y fecha preferidos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/dashboard/passenger/search-trips">Buscar Viajes</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="hover:shadow-xl transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
               {role === ROLES.DRIVER && <ListChecks className="h-6 w-6 text-accent" />}
              {role === ROLES.DRIVER ? "Gestionar Tus Viajes" : "Tus Reservas"}
            </CardTitle>
            <CardDescription>
              {role === ROLES.DRIVER
                ? "Visualiza y gestiona tus viajes publicados y las solicitudes de los pasajeros."
                : "Lleva un registro de tus viajes solicitados y confirmados."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {role === ROLES.DRIVER ? (
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <Link href="/dashboard/driver/manage-trips">Ver Mis Viajes</Link>
              </Button>
            ) : (
              <Button variant="outline" size="lg" className="w-full sm:w-auto" disabled>
                Ver Detalles (Próximamente)
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
