
// src/app/dashboard/driver/publish-trip/page.tsx
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
import { createClientComponentClient } from '@/lib/supabase/client'; 
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { es } from "date-fns/locale/es";
import { CalendarIcon, MapPin, Users, PlusCircle, Clock, Loader2 } from "lucide-react"; // Added Loader2
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { processNewTripAndNotifyPassengersAction } from "./actions"; // Importar la nueva acción

const TripFormSchema = z.object({
  origin: z.string().min(1, "Por favor selecciona un origen."),
  destination: z.string().min(1, "Por favor selecciona un destino."),
  date: z.date({
    required_error: "Se requiere una fecha para el viaje.",
  }),
  time: z.string()
    .transform((val) => {
      const meridiemMatch = val.match(/(\d{1,2}:\d{2})\s?(A\.?M\.?|P\.?M\.?)/i);
      if (meridiemMatch) {
        const timePart = meridiemMatch[1]; 
        const meridiem = meridiemMatch[2].toUpperCase().replace(/\./g, ""); 
        let [hours, minutes] = timePart.split(':').map(Number);

        if (meridiem === 'PM' && hours < 12) {
          hours += 12;
        } else if (meridiem === 'AM' && hours === 12) { 
          hours = 0;
        }
        
        const formattedHours = hours.toString().padStart(2, '0');
        const formattedMinutes = minutes.toString().padStart(2, '0');
        const transformed = `${formattedHours}:${formattedMinutes}`;
        return transformed;
      }
      return val; 
    })
    .pipe(z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM requerido).")),
  seats: z.coerce.number().min(1, "Debe haber al menos 1 asiento disponible.").max(10, "Máximo 10 asientos."),
}).refine(data => data.origin !== data.destination, {
  message: "El origen y el destino no pueden ser iguales.",
  path: ["destination"],
});

interface LocationOption {
  nombre: string;
}

export default function PublishTripPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [origins, setOrigins] = useState<LocationOption[]>([]);
  const [destinations, setDestinations] = useState<LocationOption[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const router = useRouter();
  
  const form = useForm<z.infer<typeof TripFormSchema>>({
    resolver: zodResolver(TripFormSchema),
    defaultValues: {
      seats: 1,
      origin: "",
      destination: "",
      time: "10:00", 
    },
    mode: 'onSubmit',
  });

  useEffect(() => {
    async function fetchLocations() {
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

      } catch (error: any) {
        console.error("Error fetching locations:", error);
        toast({
          title: "Error al Cargar Ubicaciones",
          description: error.message || "No se pudieron obtener los orígenes/destinos.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingLocations(false);
      }
    }
    fetchLocations();
  }, [toast, supabase]);

  async function onSubmit(data: z.infer<typeof TripFormSchema>) {
    if (!user?.id) {
      toast({
        title: "Error de Autenticación",
        description: "No se pudo identificar al conductor. Por favor, inicia sesión de nuevo.",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);

    try {
      const [hours, minutes] = data.time.split(':').map(Number);
      const localDepartureDate = new Date(
        data.date.getFullYear(),
        data.date.getMonth(),
        data.date.getDate(),
        hours,
        minutes
      );
      const departureDateTimeISO_UTC = localDepartureDate.toISOString();

      const tripToProcess = {
        driver_id: user.id,
        origin: data.origin,
        destination: data.destination,
        departure_datetime: departureDateTimeISO_UTC,
        seats_available: data.seats,
      };

      console.log("[PublishTripPage] Calling processNewTripAndNotifyPassengersAction with:", tripToProcess);
      const result = await processNewTripAndNotifyPassengersAction(tripToProcess);
      console.log("[PublishTripPage] Result from processNewTripAndNotifyPassengersAction:", result);

      if (result.success) {
        toast({
          title: "¡Viaje Publicado!",
          description: result.message, // El mensaje ahora viene de la acción
          variant: "default",
          duration: 7000, // Un poco más de tiempo para leer el mensaje
        });
        form.reset({ seats: 1, origin: "", destination: "", date: undefined, time: "10:00" }); 
        // Considerar si redirigir a manage-trips o al dashboard principal
        router.push("/dashboard/driver/manage-trips"); 
      } else {
         toast({
          title: "Error al Publicar Viaje",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("[PublishTripPage] Error in onSubmit (catch block):", error);
      toast({
        title: "Error Inesperado al Publicar",
        description: error.message || "Ocurrió un error desconocido al procesar el viaje.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <PlusCircle className="h-8 w-8 text-primary" />
          <CardTitle className="text-2xl font-bold">Publicar un Nuevo Viaje</CardTitle>
        </div>
        <CardDescription>
          Completa los detalles a continuación para ofrecer un viaje. Se notificará a los pasajeros con rutas guardadas coincidentes.
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
                          <SelectValue placeholder={isLoadingLocations ? "Cargando orígenes..." : "Selecciona ciudad de origen"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingLocations ? (
                          <SelectItem value="loading" disabled>Cargando...</SelectItem>
                        ) : origins.length === 0 ? (
                           <SelectItem value="no-options" disabled>No hay orígenes disponibles</SelectItem>
                        ) : (
                          origins.map((location) => (
                            <SelectItem key={`origin-${location.nombre}`} value={location.nombre}>
                              {location.nombre}
                            </SelectItem>
                          ))
                        )}
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
                          <SelectValue placeholder={isLoadingLocations ? "Cargando destinos..." : "Selecciona ciudad de destino"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingLocations ? (
                           <SelectItem value="loading" disabled>Cargando...</SelectItem>
                        ) : destinations.length === 0 ? (
                           <SelectItem value="no-options" disabled>No hay destinos disponibles</SelectItem>
                        ): (
                          destinations.map((location) => (
                            <SelectItem key={`destination-${location.nombre}`} value={location.nombre}>
                              {location.nombre}
                            </SelectItem>
                          ))
                        )}
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
                      <Clock className="h-4 w-4 text-muted-foreground" /> Hora del Viaje (Local)
                    </FormLabel>
                    <FormControl>
                      <Input type="time" {...field} className="w-full" disabled={isSubmitting}/>
                    </FormControl>
                    <FormDescription>Ingresa la hora en tu zona horaria local.</FormDescription>
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
                    <Input type="number" placeholder="ej: 2" {...field} onChange={e => field.onChange(parseInt(e.target.value,10) || 0)} min="1" max="10" disabled={isSubmitting} />
                  </FormControl>
                  <FormDescription>
                    Ingresa el número de asientos que ofreces para este viaje.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full md:w-auto" size="lg" disabled={isSubmitting || isLoadingLocations}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-5 w-5" />}
              {isSubmitting ? "Publicando y Notificando..." : "Publicar Viaje"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
    
