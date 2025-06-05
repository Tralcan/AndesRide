
// src/app/dashboard/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { APP_NAME, ROLES } from "@/lib/constants";
import { Car, User, PlusCircle, Search, ListChecks, Image as ImageIcon, AlertTriangle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getDashboardPromoData, type PromoDisplayData } from "./actions";

const FALLBACK_INITIAL_PROMO: PromoDisplayData = {
  generatedImageUri: "https://placehold.co/1200x400.png?text=Cargando+promoci%C3%B3n...",
  brandName: "AndesRide",
  brandLogoUrl: null,
  promoText: "Descubriendo las mejores ofertas para ti.",
};

export default function DashboardPage() {
  const { user, role } = useAuth();
  const [promoData, setPromoData] = useState<PromoDisplayData>(FALLBACK_INITIAL_PROMO);
  const [isLoadingPromo, setIsLoadingPromo] = useState(true);

  useEffect(() => {
    async function fetchPromo() {
      setIsLoadingPromo(true);
      try {
        const data = await getDashboardPromoData();
        if (data) {
          setPromoData(data);
        } else {
          setPromoData({ ...FALLBACK_INITIAL_PROMO, generatedImageUri: "https://placehold.co/1200x400.png?text=Promoci%C3%B3n+no+disponible", promoText: "No hay promociones activas en este momento."});
        }
      } catch (error) {
        console.error("Failed to fetch promo data for dashboard:", error);
        setPromoData({ ...FALLBACK_INITIAL_PROMO, generatedImageUri: "https://placehold.co/1200x400.png?text=Error+cargando", promoText: "No se pudo cargar la promoción." });
      } finally {
        setIsLoadingPromo(false);
      }
    }
    fetchPromo();
  }, []);

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
        <CardContent className="space-y-4">
          {isLoadingPromo ? (
            <div className="space-y-4">
              <Skeleton className="h-[400px] w-full rounded-lg" />
              <div className="flex items-center gap-4 pt-2">
                <Skeleton className="h-[80px] w-[80px] rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-6 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            </div>
          ) : promoData.hasError && promoData.generatedImageUri.includes("placehold.co") ? (
             <div className="relative group">
              <Image
                src={promoData.generatedImageUri}
                alt={`Promoción para ${promoData.brandName}`}
                width={1200}
                height={400}
                className="rounded-lg object-cover w-full"
                priority
              />
              <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <AlertTriangle className="h-12 w-12 text-yellow-400 mb-2"/>
                  <p className="text-white text-center text-lg px-4">No se pudo generar la imagen promocional. Mostrando imagen por defecto.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Image
                  src={promoData.generatedImageUri}
                  alt={`Promoción para ${promoData.brandName}`}
                  width={1200}
                  height={400}
                  className="rounded-lg object-cover w-full"
                  data-ai-hint="promotional banner"
                  priority
                />
              </div>
              <div className="flex items-center gap-4 pt-2">
                {promoData.brandLogoUrl && (
                  <Image
                    src={promoData.brandLogoUrl}
                    alt={`Logo ${promoData.brandName}`}
                    width={80}
                    height={80}
                    className="rounded object-contain"
                    data-ai-hint="brand logo"
                  />
                )}
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-foreground">{promoData.brandName}</h3>
                  {promoData.promoText && <p className="text-md text-muted-foreground">{promoData.promoText}</p>}
                </div>
              </div>
            </>
          )}
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
               {role === ROLES.DRIVER ? <ListChecks className="h-6 w-6 text-accent" /> : <ImageIcon className="h-6 w-6 text-accent" /> }
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
               // Actualizado para enlazar a saved-routes si es pasajero
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <Link href="/dashboard/passenger/saved-routes">Ver Rutas Guardadas</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
