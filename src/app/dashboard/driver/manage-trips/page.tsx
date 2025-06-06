// src/app/dashboard/driver/manage-trips/page.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Locale } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { createClientComponentClient } from '@/lib/supabase/client'; // Updated import
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ListChecks, Trash2, Edit3, CalendarDays, Users, MapPin, ArrowRight, Loader2, Frown } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale/es";
import Link from "next/link";

interface Trip {
  id: string;
  origin: string;
  destination: string;
  departure_datetime: string; // ISO string
  seats_available: number;
  created_at: string;
  driver_id: string;
}

const safeFormatDate = (dateInput: string | Date, formatString: string, options?: { locale?: Locale }): string => {
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) {
      console.warn(`[safeFormatDate] Invalid date input encountered: ${dateInput}`);
      return "Fecha inválida";
    }
    return format(date, formatString, options);
  } catch (e) {
    console.error(`[safeFormatDate] Error formatting date: ${dateInput}`, e);
    return "Error de fecha";
  }
};

export default function ManageTripsPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { user } = useAuth();
  const { toast } = useToast();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);

  const fetchTrips = useCallback(async () => {
    if (!user?.id) {
      setError("Usuario no autenticado o ID no disponible para cargar viajes.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("trips")
        .select("*")
        .eq("driver_id", user.id)
        .gt("departure_datetime", new Date().toISOString())
        .order("departure_datetime", { ascending: true });

      if (fetchError) {
        throw fetchError;
      }
      setTrips(data || []);
    } catch (e: any) {
      const errorMessage = e.message || "No se pudieron cargar tus viajes.";
      setError(errorMessage);
      toast({
        title: "Error al Cargar Viajes",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast, supabase]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  const handleDeleteTrip = async () => {
    if (!tripToDelete) return;

    try {
      const { error: deleteError } = await supabase
        .from("trips")
        .delete()
        .eq("id", tripToDelete.id);

      if (deleteError) throw deleteError;

      setTrips((prevTrips) => prevTrips.filter((trip) => trip.id !== tripToDelete.id));
      toast({
        title: "Viaje Eliminado",
        description: `El viaje de ${tripToDelete.origin} a ${tripToDelete.destination} ha sido eliminado.`,
        variant: "default",
      });
    } catch (e: any) {
      toast({
        title: "Error al Eliminar Viaje",
        description: e.message || "No se pudo eliminar el viaje.",
        variant: "destructive",
      });
    } finally {
      setTripToDelete(null);
    }
  };

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
          <Frown className="h-16 w-16 text-destructive mx-auto mb-4" />
          <CardTitle className="text-xl">Error al Cargar Viajes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={fetchTrips}>Intentar de Nuevo</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListChecks className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Gestionar Mis Viajes</h1>
        </div>
         <Button asChild>
            <Link href="/dashboard/driver/publish-trip">Publicar Nuevo Viaje</Link>
        </Button>
      </div>
      
      <CardDescription>
        Aquí puedes ver y gestionar los viajes que has publicado y que aún no han ocurrido.
      </CardDescription>

      {trips.length === 0 ? (
        <Card className="text-center py-12 shadow-md">
          <CardContent>
            <MapPin className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Tienes Viajes Futuros Publicados</h3>
            <p className="text-muted-foreground mb-6">
              ¿Listo para tu próxima aventura? Publica un viaje para compartirlo.
            </p>
            <Button asChild size="lg">
              <Link href="/dashboard/driver/publish-trip">Publicar un Viaje</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <Card key={trip.id} className="shadow-lg flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center justify-between">
                  <span>{trip.origin} <ArrowRight className="inline h-5 w-5 mx-1 text-muted-foreground" /> {trip.destination}</span>
                </CardTitle>
                <CardDescription className="flex items-center pt-1">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {safeFormatDate(trip.departure_datetime, "eeee dd MMM, yyyy 'a las' HH:mm", { locale: es })}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow space-y-2">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Users className="mr-2 h-4 w-4" />
                  {trip.seats_available} {trip.seats_available === 1 ? 'asiento disponible' : 'asientos disponibles'}
                </div>
                <div className="text-xs text-muted-foreground">
                    Publicado: {safeFormatDate(trip.created_at, "dd/MM/yy HH:mm", { locale: es })}
                </div>
              </CardContent>
              <CardFooter className="grid grid-cols-2 gap-2 pt-4">
                <Button variant="outline" asChild>
                  <Link href={`/dashboard/driver/edit-trip/${trip.id}`}>
                    <Edit3 className="mr-2 h-4 w-4" /> Editar
                  </Link>
                </Button>
                <Button variant="destructive" onClick={() => setTripToDelete(trip)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!tripToDelete} onOpenChange={(open) => !open && setTripToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro de eliminar este viaje?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El viaje de 
              <span className="font-semibold"> {tripToDelete?.origin} </span> 
              a 
              <span className="font-semibold"> {tripToDelete?.destination} </span> 
              programado para 
              <span className="font-semibold"> {tripToDelete ? safeFormatDate(tripToDelete.departure_datetime, "dd MMM, yyyy HH:mm", { locale: es }) : ''} </span>
              será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTripToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTrip}>
              Sí, Eliminar Viaje
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
