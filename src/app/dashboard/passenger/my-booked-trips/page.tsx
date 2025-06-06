
// src/app/dashboard/passenger/my-booked-trips/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { es } from "date-fns/locale/es";
import type { Locale } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getPassengerBookedTrips, type BookedTrip } from "./actions";
import { MapPin, CalendarDays, UserCircle, CheckCircle, Clock, XCircle, AlertTriangle, Loader2, Inbox, ArrowRight } from "lucide-react";

const safeFormatDate = (dateInput: string | Date, formatString: string, options?: { locale?: Locale }): string => {
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) {
      return "Fecha inválida";
    }
    return format(date, formatString, options);
  } catch (e) {
    console.error(`Error formatting date: ${dateInput}`, e);
    return "Error de fecha";
  }
};

const getInitials = (name?: string | null) => {
    if (!name || name.trim() === '' || name.includes('@')) {
        const emailPart = name?.split('@')[0];
        if (emailPart && emailPart.trim() !== '') {
            return emailPart.substring(0, Math.min(2, emailPart.length)).toUpperCase();
        }
        return "??";
    }
    const names = name.split(" ").filter(n => n.trim() !== '');
    if (names.length === 0) return "??";
    let initials = names[0].substring(0, 1).toUpperCase();
    if (names.length > 1) {
      initials += names[names.length - 1].substring(0, 1).toUpperCase();
    } else if (names[0].length > 1) {
      initials += names[0].substring(1, 2).toUpperCase();
    }
    return initials || "??";
};

const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="border-yellow-400 text-yellow-600 bg-yellow-50"><Clock className="mr-1 h-3 w-3" /> Pendiente</Badge>;
    case 'confirmed':
      return <Badge variant="default" className="bg-green-100 text-green-700 border-green-300"><CheckCircle className="mr-1 h-3 w-3" /> Confirmada</Badge>;
    case 'rejected':
      return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" /> Rechazada</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

export default function MyBookedTripsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bookedTrips, setBookedTrips] = useState<BookedTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // const [isCancellingId, setIsCancellingId] = useState<string | null>(null);

  const fetchBookedTrips = useCallback(async () => {
    if (!user?.id) {
      setError("Usuario no autenticado.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPassengerBookedTrips();
      setBookedTrips(data);
    } catch (e: any) {
      console.error("Error fetching booked trips:", e);
      setError(e.message || "No se pudieron cargar tus viajes reservados/solicitados.");
      toast({
        title: "Error al Cargar Viajes",
        description: e.message || "Ocurrió un error.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, toast]);

  useEffect(() => {
    fetchBookedTrips();
  }, [fetchBookedTrips]);

  // const handleCancelRequest = async (requestId: string) => {
  //   setIsCancellingId(requestId);
  //   // const result = await cancelPassengerRequest(requestId);
  //   // toast({ title: result.success ? "Solicitud Cancelada" : "Error", description: result.message, variant: result.success ? "default" : "destructive"});
  //   // if (result.success) fetchBookedTrips();
  //   setIsCancellingId(null);
  //   toast({ title: "Funcionalidad no implementada", description: "Cancelar solicitudes aún no está disponible.", variant: "default"});
  // };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Cargando tus viajes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-lg mx-auto text-center shadow-lg">
        <CardHeader>
          <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <CardTitle className="text-xl">Error al Cargar Viajes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={fetchBookedTrips} variant="outline">Intentar de Nuevo</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Mis Viajes Reservados</h1>
        </div>
      </div>
      <CardDescription>
        Aquí puedes ver el estado de los viajes que has solicitado o que ya han sido confirmados.
      </CardDescription>

      {bookedTrips.length === 0 ? (
        <Card className="text-center py-12 shadow-md">
          <CardContent>
            <Inbox className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Tienes Viajes Solicitados o Reservados</h3>
            <p className="text-muted-foreground">
              Cuando solicites unirte a un viaje, aparecerá aquí.
            </p>
            <Button asChild variant="link" className="mt-2">
                <a href="/dashboard/passenger/search-trips">Buscar un viaje</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {bookedTrips.map((trip) => {
            const originalUtcDate = new Date(trip.departureDateTime);
            const year = originalUtcDate.getUTCFullYear();
            const month = originalUtcDate.getUTCMonth();
            const day = originalUtcDate.getUTCDate();
            const hours = originalUtcDate.getUTCHours();
            const minutes = originalUtcDate.getUTCMinutes();
            const dateForDisplay = new Date(year, month, day, hours, minutes);
            const formattedDepartureDateTime = safeFormatDate(dateForDisplay, "eeee dd MMM, yyyy 'a las' HH:mm", { locale: es });
            const formattedRequestedAt = safeFormatDate(trip.requestedAt, "dd MMM, yyyy HH:mm", { locale: es });
            const driverAvatarSrc = trip.driver?.avatarUrl || `https://placehold.co/40x40.png?text=${getInitials(trip.driver?.fullName)}`;

            return (
              <Card key={trip.requestId} className="shadow-lg overflow-hidden">
                <CardHeader className="pb-4 border-b bg-muted/30">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                        <CardTitle className="text-xl flex items-center">
                            {trip.origin} <ArrowRight className="inline h-5 w-5 mx-2 text-muted-foreground" /> {trip.destination}
                        </CardTitle>
                        <StatusBadge status={trip.requestStatus} />
                    </div>
                  <div className="flex items-center text-sm text-muted-foreground pt-1">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {formattedDepartureDateTime}
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border">
                      <AvatarImage src={driverAvatarSrc} alt={trip.driver?.fullName || "Conductor"} data-ai-hint="profile person" />
                      <AvatarFallback>{getInitials(trip.driver?.fullName)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-foreground">{trip.driver?.fullName || "Conductor Anónimo"}</p>
                      <p className="text-xs text-muted-foreground">Conductor(a)</p>
                    </div>
                  </div>
                   <p className="text-xs text-muted-foreground">Solicitado el: {formattedRequestedAt}</p>
                </CardContent>
                {/* {trip.requestStatus === 'pending' && (
                  <CardFooter className="border-t pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelRequest(trip.requestId)}
                      disabled={isCancellingId === trip.requestId}
                    >
                      {isCancellingId === trip.requestId ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="mr-1 h-4 w-4" />}
                      Cancelar Solicitud
                    </Button>
                  </CardFooter>
                )} */}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
    