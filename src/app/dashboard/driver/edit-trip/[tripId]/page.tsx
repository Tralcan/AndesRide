// src/app/dashboard/driver/edit-trip/[tripId]/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createClientComponentClient } from '@/lib/supabase/client'; // Updated import
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { es } from "date-fns/locale/es";
import { CalendarIcon, MapPin, Users, Edit3, Clock, Loader2, Frown, ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

const TripFormSchema = z.object({
  origin: z.string().min(1, "Por favor selecciona un origen."),
  destination: z.string().min(1, "Por favor selecciona un destino."),
  date: z.date({
    required_error: "Se requiere una fecha para el viaje.",
  }),
  time: z.string().regex(/^([01]\\d|2[0-3]):([0-5]\\d)$/, "Formato de hora inválido (HH:MM)."),
  seats: z.coerce.number().min(1, "Debe haber al menos 1 asiento disponible.").max(10, "Máximo 10 asientos."),
}).refine(data => data.origin !== data.destination, {
  message: "El origen y el destino no pueden ser iguales.",
  path: ["destination"],
});

interface LocationOption {
  nombre: string;
}

export default function EditTripPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const tripId = params.tripId as string;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTripData, setIsLoadingTripData] = useState(true);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [origins, setOrigins] = useState<LocationOption[]>([]);
  const [destinations, setDestinations] = useState<LocationOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const form = useForm<z.infer<typeof TripFormSchema>>({
    resolver: zodResolver(TripFormSchema),
    defaultValues: {
      seats: 1,
      origin: "",
      destination: "",
      time: "10:00",
    },
  });

  const fetchTripData = useCallback(async () => {
    if (!tripId || !user?.id) {
      setError("ID de viaje o ID de usuario no disponibles.");
      setIsLoadingTripData(false);
      return;
    }
    setIsLoadingTripData(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("trips")
        .select("origin, destination, departure_datetime, seats_available, driver_id")
        .eq("id", tripId)
        .single();

      if (fetchError) throw fetchError;
      if (!data) throw new Error("Viaje no encontrado.");
      if (data.driver_id !== user.id) {
         setError("No tienes permiso para editar este viaje.");
         setIsLoadingTripData(false);
         return;
      }

      const dateObject = new Date(data.departure_datetime);
      const timeString = format(dateObject, "HH:mm");

      form.reset({
        origin: data.origin,
        destination: data.destination,
        date: dateObject,
        time: timeString,
        seats: data.seats_available,
      });

    } catch (e: any) {
      console.error("[EditTripPage] Error fetching trip data:", e);
      setError(e.message || "No se pudo cargar la información del viaje.");
      toast({
        title: "Error al Cargar Viaje",
        description: e.message || "No se pudieron obtener los detalles del viaje.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTripData(false);
    }
  }, [tripId, user?.id, form, toast, supabase]);
  
  const fetchLocations = useCallback(async () => {
      setIsLoadingLocations(true);
      try {
        const { data: originsData, error: originsError } = await supabase
          .from('origen')
          .select('nombre')
          .eq('estado', true);
        if (originsError) throw originsError;
        setOrigins(originsData || []);

        const { data: destinationsData, error: destinationsError } = await supabase
          .from('destino')
          .select('nombre')
          .eq('estado', true);
        if (destinationsError) throw destinationsError;
        setDestinations(destinationsData || []);
      } catch (e: any) {
        console.error("[EditTripPage] Error fetching locations:", e);
        toast({
          title: "Error al Cargar Ubicaciones",
          description: e.message || "No se pudieron obtener los orígenes/destinos.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingLocations(false);
      }
  }, [toast, supabase]);

  useEffect(() => {
    fetchLocations();
    fetchTripData();
  }, [fetchLocations, fetchTripData]);


  async function onSubmit(data: z.infer<typeof TripFormSchema>) {
    if (!user?.id || !tripId) {
      toast({ title: "Error", description: "Falta información para actualizar.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    try {
      const year = data.date.getFullYear();
      const month = (data.date.getMonth() + 1).toString().padStart(2, '0');
      const day = data.date.getDate().toString().padStart(2, '0');
      const [hours, minutes] = data.time.split(':');
      
      const departureDateTime = `${year}-${month}-${day}T${hours}:${minutes}:00`;

      const tripToUpdate = {
        origin: data.origin,
        destination: data.destination,
        departure_datetime: departureDateTime,
        seats_available: data.seats,
        updated_at: new Date().toISOString(),
      };
      
      const { error: updateError } = await supabase
        .from('trips')
        .update(tripToUpdate)
        .eq('id', tripId)
        .eq('driver_id', user.id);

      if (updateError) throw updateError;

      toast({
        title: "¡Viaje Actualizado!",
        description: `El viaje de ${data.origin} a ${data.destination} ha sido actualizado.`,
        variant: "default"
      });
      router.push("/dashboard/driver/manage-trips");
    } catch (e: any) {
      console.error("[EditTripPage] Error updating trip:", e);
      toast({
        title: "Error al Actualizar Viaje",
        description: e.message || "Ocurrió un error desconocido al guardar los cambios.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingTripData || isLoadingLocations) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Cargando datos del viaje...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-lg mx-auto text-center shadow-lg">
        <CardHeader>
          <Frown className="h-16 w-16 text-destructive mx-auto mb-4" />
          <CardTitle className="text-xl">Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button asChild variant="outline">
            <Link href="/dashboard/driver/manage-trips">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver a Mis Viajes
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl">
      <CardHeader>
        <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
                <Edit3 className="h-8 w-8 text-primary" />
                <CardTitle className="text-2xl font-bold">Editar Viaje</CardTitle>
            </div>
            <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/driver/manage-trips">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver
                </Link>
            </Button>
        </div>
        <CardDescription>
          Modifica los detalles de tu viaje y guarda los cambios.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="origin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-muted-foreground" /> Origen
                    </FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                      disabled={isLoadingLocations || isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingLocations ? "Cargando..." : "Selecciona ciudad de origen"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {origins.map((location) => (
                          <SelectItem key={`origin-${location.nombre}`} value={location.nombre}>
                            {location.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-muted-foreground" /> Destino
                    </FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                      disabled={isLoadingLocations || isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingLocations ? "Cargando..." : "Selecciona ciudad de destino"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {destinations.map((location) => (
                          <SelectItem key={`destination-${location.nombre}`} value={location.nombre}>
                            {location.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="flex items-center gap-1">
                       <CalendarIcon className="h-4 w-4 text-muted-foreground" /> Fecha del Viaje
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isSubmitting}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: es })
                            ) : (
                              <span>Elige una fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) || isSubmitting } 
                          initialFocus
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" /> Hora del Viaje
                    </FormLabel>
                    <FormControl>
                      <Input type="time" {...field} className="w-full" disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="seats"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-muted-foreground" /> Asientos Disponibles
                  </FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="ej: 2" {...field} onChange={e => field.onChange(parseInt(e.target.value,10) || 0)} min="1" max="10" disabled={isSubmitting}/>
                  </FormControl>
                  <FormDescription>
                    Ingresa el número de asientos que ofreces para este viaje.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
                <Button type="submit" size="lg" disabled={isSubmitting || isLoadingLocations || isLoadingTripData}>
                {isSubmitting ? "Guardando Cambios..." : "Guardar Cambios"}
                </Button>
                <Button type="button" variant="outline" size="lg" onClick={() => router.push("/dashboard/driver/manage-trips")} disabled={isSubmitting}>
                    Cancelar
                </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
