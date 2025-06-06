// src/app/dashboard/passenger/saved-routes/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { es } from "date-fns/locale/es";
import { CalendarIcon, MapPin, BookmarkPlus, BellRing, Trash2, Route } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { watchRoute, type WatchRouteInput } from "@/ai/flows/route-watcher";
import { createClientComponentClient } from '@/lib/supabase/client'; // Updated import

const SavedRouteSchema = z.object({
  origin: z.string().min(1, "Por favor selecciona un origen."),
  destination: z.string().min(1, "Por favor selecciona un destino."),
  date: z.date().optional(),
}).refine(data => data.origin !== data.destination, {
  message: "El origen y el destino no pueden ser iguales.",
  path: ["destination"],
});

interface SavedRouteItem extends z.infer<typeof SavedRouteSchema> {
  id: string;
}

interface LocationOption {
  nombre: string;
}

export default function SavedRoutesPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { user } = useAuth();
  const { toast } = useToast();
  const [savedRoutes, setSavedRoutes] = useState<SavedRouteItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [origins, setOrigins] = useState<LocationOption[]>([]);
  const [destinations, setDestinations] = useState<LocationOption[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);

  const form = useForm<z.infer<typeof SavedRouteSchema>>({
    resolver: zodResolver(SavedRouteSchema),
    defaultValues: {
      origin: "",
      destination: "",
    }
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
        console.error("Error fetching locations for Saved Routes:", error);
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

  async function onSubmit(data: z.infer<typeof SavedRouteSchema>) {
    if (!user?.email) {
      toast({ title: "Error", description: "Email del usuario no encontrado. Por favor, inicia sesión de nuevo.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    const newSavedRoute: SavedRouteItem = { ...data, id: Date.now().toString() };
    setSavedRoutes(prev => [...prev, newSavedRoute]);
    form.reset({ origin: "", destination: "", date: undefined });
    
    toast({
      title: "¡Ruta Guardada!",
      description: `Ruta de ${data.origin} a ${data.destination} guardada. Te notificaremos sobre viajes coincidentes.`,
      variant: "default"
    });

    try {
      const watchInput: WatchRouteInput = {
        passengerEmail: user.email,
        origin: data.origin,
        destination: data.destination,
        date: data.date ? format(data.date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      };
      
      watchRoute(watchInput).then(output => {
        if (output.routeMatchFound) {
           toast({
            title: "¡Vigilante de Ruta Activo!",
            description: output.message,
            variant: output.notificationSent ? "default" : "destructive",
            duration: 7000,
            action: output.notificationSent ? <Button variant="outline" size="sm" onClick={() => console.log("Notification action clicked")}>Ver Coincidencias</Button> : undefined
          });
        } else {
           toast({
            title: "Actualización del Vigilante de Ruta",
            description: output.message || "Monitoreando tu ruta guardada para nuevos viajes.",
            variant: "default",
            duration: 5000
          });
        }
      }).catch(error => {
        console.error("Error calling watchRoute:", error);
        toast({
          title: "Error del Vigilante de Ruta",
          description: "No se pudo comenzar a vigilar la ruta. Por favor, inténtalo de nuevo.",
          variant: "destructive",
        });
      });

    } catch (error) {
      console.error("Error setting up route watcher:", error);
      toast({
        title: "Error",
        description: "No se pudo configurar el vigilante de ruta.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }
  
  const removeRoute = (id: string) => {
    setSavedRoutes(prev => prev.filter(route => route.id !== id));
    toast({ title: "Ruta Eliminada", description: "La ruta guardada ha sido eliminada." });
  };

  return (
    <div className="space-y-8">
      <Card className="w-full max-w-2xl mx-auto shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <BookmarkPlus className="h-8 w-8 text-primary" />
            <CardTitle className="text-2xl font-bold">Guardar Ruta Preferida</CardTitle>
          </div>
          <CardDescription>
            Guarda tus rutas frecuentes y recibe notificaciones de nuestro Vigilante de Rutas IA cuando se publiquen viajes coincidentes.
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
                      <FormLabel className="flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground" /> Origen</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value}
                        disabled={isLoadingLocations}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingLocations ? "Cargando..." : "Selecciona origen"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingLocations ? (
                            <SelectItem value="loading" disabled>Cargando...</SelectItem>
                          ) : origins.length === 0 ? (
                            <SelectItem value="no-options" disabled>No hay orígenes</SelectItem>
                          ) : (
                            origins.map(loc => <SelectItem key={`sro-${loc.nombre}`} value={loc.nombre}>{loc.nombre}</SelectItem>)
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
                      <FormLabel className="flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground" /> Destino</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value}
                        disabled={isLoadingLocations}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingLocations ? "Cargando..." : "Selecciona destino"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingLocations ? (
                            <SelectItem value="loading" disabled>Cargando...</SelectItem>
                          ) : destinations.length === 0 ? (
                            <SelectItem value="no-options" disabled>No hay destinos</SelectItem>
                          ) : (
                            destinations.map(loc => <SelectItem key={`srd-${loc.nombre}`} value={loc.nombre}>{loc.nombre}</SelectItem>)
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
                    <FormLabel className="flex items-center gap-1"><CalendarIcon className="h-4 w-4 text-muted-foreground" /> Fecha Preferida (Opcional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP", { locale: es }) : <span>Cualquier fecha</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus 
                          disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} locale={es} />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>Deja en blanco para recibir notificaciones para cualquier fecha.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full md:w-auto" size="lg" disabled={isSubmitting || isLoadingLocations}>
                <BellRing className="mr-2 h-5 w-5" /> {isSubmitting ? "Guardando..." : "Guardar Ruta y Vigilar"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {savedRoutes.length > 0 && (
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Tus Rutas Guardadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {savedRoutes.map(route => (
              <div key={route.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Route className="h-6 w-6 text-primary"/>
                  <div>
                    <p className="font-medium">{route.origin} a {route.destination}</p>
                    <p className="text-sm text-muted-foreground">
                      Fecha: {route.date ? format(route.date, "PPP", { locale: es }) : "Cualquiera"}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeRoute(route.id)} aria-label="Eliminar ruta guardada">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
