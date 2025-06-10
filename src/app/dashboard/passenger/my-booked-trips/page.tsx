
// src/app/dashboard/passenger/my-booked-trips/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { format, parseISO, isPast } from "date-fns"; 
import { es } from "date-fns/locale/es";
import type { Locale } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getPassengerBookedTrips, cancelPassengerTripRequestAction, type BookedTrip, type CancelRequestResult } from "./actions";
import { MapPin, CalendarDays, UserCircle, CheckCircle, Clock, XCircle, AlertTriangle, Loader2, Inbox, ArrowRight, Ban, Edit } from "lucide-react"; // Added Edit for modified trips

const safeFormatDate = (dateInput: string | Date, formatString: string, options?: { locale?: Locale }): string => {
  try {
    let date: Date;
    if (typeof dateInput === 'string') {
      date = parseISO(dateInput); 
    } else {
      date = dateInput; 
    }
    if (isNaN(date.getTime())) {
      console.warn(`[safeFormatDate MyBookedTrips] Invalid date after parsing/input: ${dateInput}`);
      return "Fecha inválida";
    }
    return format(date, formatString, options);
  } catch (e) {
    console.error(`[safeFormatDate MyBookedTrips] Error formatting date: ${dateInput}`, e);
    return "Error de fecha";
  }
};

const getInitials = (name?: string | null) => {
    if (!name || name.trim() === '' || name.includes('@') || name.startsWith('Conductor (ID:')) {
        const emailPart = name?.split('@')[0];
        const idPartMatch = name?.match(/Conductor \(ID: (.*?)\.\.\.\)/);
        if (idPartMatch && idPartMatch[1] && idPartMatch[1].trim() !== '') {
          return idPartMatch[1].substring(0,2).toUpperCase();
        }
        if (emailPart && emailPart.trim() !== '') {
            return emailPart.substring(0, Math.min(2, emailPart.length)).toUpperCase();
        }
        return "DR"; 
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

const StatusBadge = ({ status, tripDepartureISO }: { status: string; tripDepartureISO: string }) => {
  const isTripPast = isPast(parseISO(tripDepartureISO));

  if (isTripPast && (status === 'pending' || status === 'confirmed')) {
     return <Badge variant="outline" className="border-slate-400 text-slate-600 bg-slate-100"><Clock className="mr-1 h-3 w-3" /> Completado/Pasado</Badge>;
  }

  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="border-yellow-400 text-yellow-600 bg-yellow-50"><Clock className="mr-1 h-3 w-3" /> Pendiente</Badge>;
    case 'confirmed':
      return <Badge variant="default" className="bg-green-100 text-green-700 border-green-300"><CheckCircle className="mr-1 h-3 w-3" /> Confirmada</Badge>;
    case 'rejected':
      return <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-300"><XCircle className="mr-1 h-3 w-3" /> Rechazada</Badge>;
    case 'cancelled': // Passenger cancelled
      return <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-300"><Ban className="mr-1 h-3 w-3" /> Cancelada por ti</Badge>;
    case 'cancelled_by_driver':
      return <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-300"><Ban className="mr-1 h-3 w-3" /> Cancelada por Conductor</Badge>;
    case 'cancelled_trip_modified':
      return <Badge variant="destructive" className="bg-purple-100 text-purple-700 border-purple-300"><Edit className="mr-1 h-3 w-3" /> Viaje Modificado</Badge>;
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
  const [isCancellingId, setIsCancellingId] = useState<string | null>(null);

  const fetchBookedTrips = useCallback(async () => {
    if (!user?.id) {
      setError("Usuario no autenticado.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPassengerBookedTrips(); // This action now fetches all relevant statuses for history
      setBookedTrips(data);
    } catch (e: any) {
      console.error("[MyBookedTripsPage] Error fetching booked trips:", e);
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

  const handleCancelRequest = async (requestId: string) => {
    setIsCancellingId(requestId);
    try {
        const result: CancelRequestResult = await cancelPassengerTripRequestAction(requestId);
        toast({ 
            title: result.success ? "Operación Exitosa" : "Error en Operación", 
            description: result.message, 
            variant: result.success ? "default" : "destructive"
        });
        if (result.success) {
            fetchBookedTrips(); 
        }
    } catch (e:any) {
        toast({
            title: "Error Inesperado",
            description: "Ocurrió un error al intentar cancelar la solicitud: " + e.message,
            variant: "destructive"
        });
    } finally {
        setIsCancellingId(null);
    }
  };
  
  // Separate active and past/cancelled trips for display
  const activeTrips = bookedTrips.filter(trip => 
    (trip.requestStatus === 'pending' || trip.requestStatus === 'confirmed') && !isPast(parseISO(trip.departureDateTime))
  );
  const historicalTrips = bookedTrips.filter(trip => 
    !( (trip.requestStatus === 'pending' || trip.requestStatus === 'confirmed') && !isPast(parseISO(trip.departureDateTime)) )
  );


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
          <h1 className="text-3xl font-bold">Mis Viajes Solicitados</h1>
        </div>
      </div>
      <CardDescription>
        Aquí puedes ver el estado de los viajes que has solicitado. Las horas se muestran en tu zona horaria local.
      </CardDescription>

      {activeTrips.length === 0 && historicalTrips.length === 0 && (
        <Card className="text-center py-12 shadow-md">
          <CardContent>
            <Inbox className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Tienes Viajes Solicitados</h3>
            <p className="text-muted-foreground">
              Cuando solicites unirte a un viaje, aparecerá aquí.
            </p>
            <Button asChild variant="link" className="mt-2">
                <Link href="/dashboard/passenger/search-trips">Buscar un viaje</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTrips.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">Viajes Activos</h2>
          <div className="space-y-6">
            {activeTrips.map((trip) => {
              const formattedDepartureDateTime = safeFormatDate(trip.departureDateTime, "eeee dd MMM, yyyy 'a las' HH:mm", { locale: es });
              const formattedRequestedAt = safeFormatDate(trip.requestedAt, "dd MMM, yyyy HH:mm", { locale: es });
              const driverNameForDisplay = trip.driver?.fullName || "Conductor Anónimo";
              const driverAvatarSrc = (trip.driver?.avatarUrl && trip.driver.avatarUrl.trim() !== '')
                ? trip.driver.avatarUrl
                : `https://placehold.co/40x40.png?text=${getInitials(trip.driver?.fullName)}`;
              const canCancel = (trip.requestStatus === 'pending' || trip.requestStatus === 'confirmed') && !isPast(parseISO(trip.departureDateTime));

              return (
                <Card key={trip.requestId} className="shadow-lg overflow-hidden">
                  <CardHeader className="pb-4 border-b bg-muted/30">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                          <CardTitle className="text-xl flex items-center">
                              {trip.origin} <ArrowRight className="inline h-5 w-5 mx-2 text-muted-foreground" /> {trip.destination}
                          </CardTitle>
                          <StatusBadge status={trip.requestStatus} tripDepartureISO={trip.departureDateTime} />
                      </div>
                    <div className="flex items-center text-sm text-muted-foreground pt-1">
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {formattedDepartureDateTime}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border">
                        <AvatarImage src={driverAvatarSrc} alt={driverNameForDisplay} data-ai-hint="profile person" />
                        <AvatarFallback>{getInitials(driverNameForDisplay)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold text-foreground">{driverNameForDisplay}</p>
                        <p className="text-xs text-muted-foreground">Conductor(a)</p>
                      </div>
                    </div>
                     <p className="text-xs text-muted-foreground">Solicitado el: {formattedRequestedAt}</p>
                  </CardContent>
                  {canCancel && (
                    <CardFooter className="border-t pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive text-destructive hover:bg-destructive/10"
                        onClick={() => handleCancelRequest(trip.requestId)}
                        disabled={isCancellingId === trip.requestId}
                      >
                        {isCancellingId === trip.requestId ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="mr-1 h-4 w-4" />}
                        Cancelar Solicitud
                      </Button>
                    </CardFooter>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
      
      {historicalTrips.length > 0 && (
         <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-4">Historial de Viajes</h2>
          <div className="space-y-6">
            {historicalTrips.map((trip) => {
              const formattedDepartureDateTime = safeFormatDate(trip.departureDateTime, "eeee dd MMM, yyyy 'a las' HH:mm", { locale: es });
              const formattedRequestedAt = safeFormatDate(trip.requestedAt, "dd MMM, yyyy HH:mm", { locale: es });
              const driverNameForDisplay = trip.driver?.fullName || "Conductor Anónimo";
              const driverAvatarSrc = (trip.driver?.avatarUrl && trip.driver.avatarUrl.trim() !== '')
                ? trip.driver.avatarUrl
                : `https://placehold.co/40x40.png?text=${getInitials(trip.driver?.fullName)}`;
              
              return (
                <Card key={trip.requestId} className="shadow-md overflow-hidden bg-muted/20 opacity-80">
                  <CardHeader className="pb-4 border-b">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                          <CardTitle className="text-lg flex items-center text-muted-foreground">
                              {trip.origin} <ArrowRight className="inline h-4 w-4 mx-2 text-muted-foreground/70" /> {trip.destination}
                          </CardTitle>
                          <StatusBadge status={trip.requestStatus} tripDepartureISO={trip.departureDateTime}/>
                      </div>
                    <div className="flex items-center text-xs text-muted-foreground pt-1">
                      <CalendarDays className="mr-2 h-3 w-3" />
                      {formattedDepartureDateTime}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 border">
                        <AvatarImage src={driverAvatarSrc} alt={driverNameForDisplay} data-ai-hint="profile person" />
                        <AvatarFallback className="text-xs">{getInitials(driverNameForDisplay)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm text-muted-foreground">{driverNameForDisplay}</p>
                        <p className="text-xs text-muted-foreground/80">Conductor(a)</p>
                      </div>
                    </div>
                     <p className="text-xs text-muted-foreground/80">Solicitado el: {formattedRequestedAt}</p>
                      {trip.requestStatus === 'cancelled_trip_modified' && 
                        <p className="text-xs text-purple-600">El conductor modificó este viaje después de tu solicitud. Puedes buscarlo de nuevo si sigues interesado.</p>
                      }
                      {trip.requestStatus === 'cancelled_by_driver' && 
                        <p className="text-xs text-red-600">El conductor canceló este viaje.</p>
                      }
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
