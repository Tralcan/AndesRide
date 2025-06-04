
// src/app/dashboard/driver/publish-trip/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { es } from "date-fns/locale/es";
import { CalendarIcon, MapPin, Users, PlusCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient"; // Import Supabase client

// Updated Zod schema
const TripFormSchema = z.object({
  origin: z.string().min(1, "Por favor selecciona un origen."),
  destination: z.string().min(1, "Por favor selecciona un destino."),
  date: z.date({
    required_error: "Se requiere una fecha para el viaje.",
  }),
  seats: z.coerce.number().min(1, "Debe haber al menos 1 asiento disponible.").max(10, "Máximo 10 asientos."),
}).refine(data => data.origin !== data.destination, {
  message: "El origen y el destino no pueden ser iguales.",
  path: ["destination"],
});

interface LocationOption {
  nombre: string;
}

export default function PublishTripPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [origins, setOrigins] = useState<LocationOption[]>([]);
  const [destinations, setDestinations] = useState<LocationOption[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  
  const form = useForm<z.infer<typeof TripFormSchema>>({
    resolver: zodResolver(TripFormSchema),
    defaultValues: {
      seats: 1,
      origin: "", // Initialize as empty string
      destination: "", // Initialize as empty string
    },
  });

  useEffect(() => {
    async function fetchLocations() {
      setIsLoadingLocations(true);
      try {
        const { data: originsData, error: originsError } = await supabase
          .from('origen') // Assuming your table is named 'origen'
          .select('nombre') // Assuming the column with location name is 'nombre'
          .eq('estado', true);

        if (originsError) throw originsError;
        setOrigins(originsData || []);

        const { data: destinationsData, error: destinationsError } = await supabase
          .from('destino') // Assuming your table is named 'destino'
          .select('nombre') // Assuming the column with location name is 'nombre'
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
  }, [toast]);

  async function onSubmit(data: z.infer<typeof TripFormSchema>) {
    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("Trip data submitted:", data);
    toast({
      title: "¡Viaje Publicado!",
      description: `Tu viaje de ${data.origin} a ${data.destination} el ${format(data.date, "PPP", { locale: es })} ha sido publicado exitosamente.`,
      variant: "default"
    });
    form.reset({ seats: 1, origin: "", destination: "", date: undefined }); 
    setIsSubmitting(false);
  }

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <PlusCircle className="h-8 w-8 text-primary" />
          <CardTitle className="text-2xl font-bold">Publicar un Nuevo Viaje</CardTitle>
        </div>
        <CardDescription>
          Completa los detalles a continuación para ofrecer un viaje a otros viajeros.
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
                      value={field.value} // Use value instead of defaultValue for controlled component
                      disabled={isLoadingLocations}
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
                      value={field.value} // Use value instead of defaultValue
                      disabled={isLoadingLocations}
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
                        disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) } 
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
              name="seats"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-muted-foreground" /> Asientos Disponibles
                  </FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="ej: 2" {...field} onChange={e => field.onChange(parseInt(e.target.value,10) || 0)} min="1" max="10" />
                  </FormControl>
                  <FormDescription>
                    Ingresa el número de asientos que ofreces para este viaje.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full md:w-auto" size="lg" disabled={isSubmitting || isLoadingLocations}>
              {isSubmitting ? "Publicando..." : "Publicar Viaje"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

    