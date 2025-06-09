
// src/app/dashboard/driver/passenger-requests/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { format, parseISO } from "date-fns"; // Import parseISO
import { es } from "date-fns/locale/es";
import type { Locale } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getDriverTripsWithRequests, updateTripRequestStatus, type TripWithPassengerRequests, type PassengerRequest } from "./actions";
import { Users, CalendarDays, MapPin, ArrowRight, CheckCircle, XCircle, UserCheck, AlertTriangle, Loader2, Inbox } from "lucide-react";

const safeFormatDate = (dateInput: string | Date, formatString: string, options?: { locale?: Locale }): string => {
  try {
    let date: Date;
    if (typeof dateInput === 'string') {
      date = parseISO(dateInput); // Use parseISO for strings
    } else {
      date = dateInput; // Assume it's already a Date object
    }
    // Log para depuración
    console.log(`[safeFormatDate PassengerRequests] Input: ${typeof dateInput === 'string' ? dateInput : dateInput.toISOString()}, Parsed/Original Date obj (local for toString): ${date.toString()}, IsNaN: ${isNaN(date.getTime())}`);
    
    if (isNaN(date.getTime())) {
      console.warn(`[safeFormatDate PassengerRequests] Invalid date after parsing/input: ${dateInput}`);
      return "Fecha inválida";
    }
    return format(date, formatString, options);
  } catch (e) {
    console.error(`[safeFormatDate PassengerRequests] Error formatting date: ${dateInput}`, e);
    return "Error de fecha";
  }
};

const getPassengerInitials = (name?: string | null) => {
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


export default function PassengerRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tripsWithRequests, setTripsWithRequests] = useState<TripWithPassengerRequests[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingRequestId, setIsUpdatingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!user?.id) {
      setError("Usuario no autenticado.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDriverTripsWithRequests();
      const filteredData = data.map(trip => ({
        ...trip,
        requests: trip.requests.filter(r => r.status === 'pending' || r.status === 'confirmed')
      })).filter(trip => trip.requests.length > 0); 

      setTripsWithRequests(filteredData);
    } catch (e: any) {
      console.error("Error fetching passenger requests:", e);
      setError(e.message || "No se pudieron cargar las solicitudes.");
      toast({
        title: "Error al Cargar Solicitudes",
        description: e.message || "Ocurrió un error.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, toast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleUpdateRequestStatus = async (requestId: string, newStatus: 'confirmed' | 'rejected') => {
    setIsUpdatingRequestId(requestId);
    try {
      const result = await updateTripRequestStatus(requestId, newStatus);
      if (result.success) {
        toast({
          title: "Solicitud Actualizada",
          description: result.message,
          variant: "default",
        });
        fetchRequests(); 
      } else {
        toast({
          title: "Error al Actualizar",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (e: any) {
      console.error("Error updating request status:", e);
      toast({
        title: "Error Inesperado",
        description: e.message || "Ocurrió un error al actualizar la solicitud.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingRequestId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Cargando solicitudes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-lg mx-auto text-center shadow-lg">
        <CardHeader>
          <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <CardTitle className="text-xl">Error al Cargar Solicitudes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={fetchRequests} variant="outline">Intentar de Nuevo</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCheck className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Solicitudes de Pasajeros</h1>
        </div>
      </div>
      <CardDescription>
        Gestiona las solicitudes de los pasajeros para tus viajes publicados. Las horas se muestran en tu zona horaria local.
      </CardDescription>

      {tripsWithRequests.length === 0 ? (
        <Card className="text-center py-12 shadow-md">
          <CardContent>
            <Inbox className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Hay Solicitudes Pendientes o Confirmadas</h3>
            <p className="text-muted-foreground">
              Cuando los pasajeros soliciten unirse a tus viajes y estas solicitudes estén pendientes o confirmadas, aparecerán aquí.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {tripsWithRequests.map((trip) => {
            // La cadena ISO trip.departureDateTime se pasa directamente a safeFormatDate
            const formattedDepartureDateTime = safeFormatDate(trip.departureDateTime, "eeee dd MMM, yyyy 'a las' HH:mm", { locale: es });

            return (
              <Card key={trip.tripId} className="shadow-lg">
                <CardHeader className="pb-4 border-b">
                  <CardTitle className="text-xl flex items-center justify-between">
                    <span>{trip.origin} <ArrowRight className="inline h-5 w-5 mx-1 text-muted-foreground" /> {trip.destination}</span>
                  </CardTitle>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {formattedDepartureDateTime}
                    </div>
                    <div className="flex items-center mt-1 sm:mt-0">
                      <Users className="mr-2 h-4 w-4" />
                      {trip.seatsAvailable} {trip.seatsAvailable === 1 ? 'asiento disponible' : 'asientos disponibles'}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {trip.requests.length === 0 ? ( 
                     <p className="text-muted-foreground text-sm">No hay solicitudes activas para este viaje.</p>
                  ) : (
                    trip.requests.map((request) => {
                      const passengerName = request.passenger?.fullName || "Pasajero Anónimo";
                      const passengerAvatar = request.passenger?.avatarUrl || `https://placehold.co/40x40.png?text=${getPassengerInitials(passengerName)}`;
                       // La cadena ISO request.requestedAt se pasa directamente a safeFormatDate
                      const formattedRequestedAt = safeFormatDate(request.requestedAt, "dd MMM, yyyy HH:mm", { locale: es });

                      return (
                        <div key={request.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-md hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3 mb-3 sm:mb-0">
                            <Avatar className="h-10 w-10 border">
                              <AvatarImage src={passengerAvatar} alt={passengerName} data-ai-hint="profile person" />
                              <AvatarFallback>{getPassengerInitials(passengerName)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-foreground">{passengerName}</p>
                              <p className="text-xs text-muted-foreground">Solicitado: {formattedRequestedAt}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            {request.status === 'pending' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="bg-green-500 hover:bg-green-600 text-white flex-1 sm:flex-none"
                                  onClick={() => handleUpdateRequestStatus(request.id, 'confirmed')}
                                  disabled={isUpdatingRequestId === request.id || trip.seatsAvailable <= 0}
                                >
                                  {isUpdatingRequestId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />}
                                  Aceptar
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="flex-1 sm:flex-none"
                                  onClick={() => handleUpdateRequestStatus(request.id, 'rejected')}
                                  disabled={isUpdatingRequestId === request.id}
                                >
                                  {isUpdatingRequestId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="mr-1 h-4 w-4" />}
                                  Rechazar
                                </Button>
                              </>
                            )}
                            {request.status === 'confirmed' && (
                              <Badge variant="default" className="bg-green-100 text-green-700 border-green-300 py-1 px-3">
                                <CheckCircle className="mr-1 h-4 w-4" /> Confirmada
                              </Badge>
                            )}
                            {request.status === 'rejected' && ( 
                              <Badge variant="destructive" className="py-1 px-3">
                                <XCircle className="mr-1 h-4 w-4" /> Rechazada
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
                 {trip.seatsAvailable <= 0 && trip.requests.some(r => r.status === 'pending') && (
                    <CardFooter className="pt-3 border-t">
                        <p className="text-sm text-orange-600 flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4" />
                            No puedes aceptar más solicitudes, no hay asientos disponibles.
                        </p>
                    </CardFooter>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  );
}

