// src/app/dashboard/passenger/saved-routes/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale/es";
import { CalendarIcon, MapPin, BookmarkPlus, BellRing, Trash2, Route, Loader2 } from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { watchRoute, type WatchRouteInput } from "@/ai/flows/route-watcher";
import { createClientComponentClient } from '@/lib/supabase/client';
import { addSavedRouteAction, getSavedRoutesAction, deleteSavedRouteAction, type SavedRouteFromDB } from "./actions";

const ClientSideFormSchema = z.object({
  origin: z.string().min(1, "Por favor selecciona un origen."),
  destination: z.string().min(1, "Por favor selecciona un destino."),
  date: z.date().optional(), // Date object para el picker
}).refine(data => data.origin !== data.destination, {
  message: "El origen y el destino no pueden ser iguales.",
  path: ["destination"],
});

// Interfaz para el estado local, que usa Date object para 'date' si existe
interface SavedRouteItemUI {
  id: string;
  origin: string;
  destination:string;
  date?: Date | null; // Usamos Date object aquí para el UI y el picker
}

interface LocationOption {
  nombre: string;
}

export default function SavedRoutesPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { user } = useAuth();
  const { toast } = useToast();
  const [savedRoutesUI, setSavedRoutesUI] = useState<SavedRouteItemUI[]>([]);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(true);
  const [origins, setOrigins] = useState<LocationOption[]>([]);
  const [destinations, setDestinations] = useState<LocationOption[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);

  const form = useForm<z.infer<typeof ClientSideFormSchema>>({
    resolver: zodResolver(ClientSideFormSchema),
    defaultValues: {
      origin: "",
      destination: "",
      date: undefined,
    }
  });

  const fetchSavedRoutes = useCallback(async () => {
    if (!user) return;
    setIsLoadingRoutes(true);
    const result = await getSavedRoutesAction();
    if (result.success && result.routes) {
      const uiRoutes = result.routes.map(route => ({
        id: route.id,
        origin: route.origin,
        destination: route.destination,
        date: route.preferred_date ? parseISO(route.preferred_date) : null,
      }));
      setSavedRoutesUI(uiRoutes);
    } else {
      toast({ title: "Error al Cargar Rutas", description: result.error || "No se pudieron cargar las rutas guardadas.", variant: "destructive" });
    }
    setIsLoadingRoutes(false);
  }, [user, toast]);

  useEffect(() => {
    async function fetchLocations() {
      setIsLoadingLocations(true);
      try {
        const { data: originsData, error: originsError } = await supabase.from('origen').select('nombre').eq('estado', true);
        if (originsError) throw originsError;
        setOrigins(originsData || []);

        const { data: destinationsData, error: destinationsError } = await supabase.from('destino').select('nombre').eq('estado', true);
        if (destinationsError) throw destinationsError;
        setDestinations(destinationsData || []);
      } catch (error: any) {
        toast({ title: "Error al Cargar Ubicaciones", description: error.message || "No se pudieron obtener los orígenes/destinos.", variant: "destructive" });
      } finally {
        setIsLoadingLocations(false);
      }
    }
    fetchLocations();
    fetchSavedRoutes();
  }, [toast, supabase, fetchSavedRoutes]);

  async function onSubmit(formData: z.infer<typeof ClientSideFormSchema>) {
    if (!user?.email) {
      toast({ title: "Error", description: "Email del usuario no encontrado.", variant: "destructive" });
      return;
    }
    setIsSubmittingForm(true);

    const routeDataForDB = {
      origin: formData.origin,
      destination: formData.destination,
      preferred_date: formData.date ? format(formData.date, "yyyy-MM-dd") : null,
    };

    const result = await addSavedRouteAction(routeDataForDB);

    if (result.success && result.route) {
      // Add to local state for immediate UI update
      setSavedRoutesUI(prev => [{ 
        id: result.route!.id, 
        origin: result.route!.origin, 
        destination: result.route!.destination,
        date: result.route!.preferred_date ? parseISO(result.route!.preferred_date) : null
       }, ...prev]);
      form.reset({ origin: "", destination: "", date: undefined });
      toast({
        title: "¡Ruta Guardada en Base de Datos!",
        description: `Ruta de ${formData.origin} a ${formData.destination} guardada. Te notificaremos sobre viajes coincidentes.`,
        variant: "default"
      });

      // Call Genkit flow
      try {
        const watchInput: WatchRouteInput = {
          passengerEmail: user.email,
          origin: formData.origin,
          destination: formData.destination,
          date: formData.date ? format(formData.date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"), // Default to today if no date
        };
        
        watchRoute(watchInput).then(output => {
          toast({
            title: output.routeMatchFound ? "¡Vigilante de Ruta Activo!" : "Actualización del Vigilante de Ruta",
            description: output.message || "Monitoreando tu ruta guardada.",
            variant: output.routeMatchFound && !output.notificationSent ? "destructive" : "default",
            duration: 7000,
          });
        }).catch(genkitError => {
          console.error("Error calling watchRoute:", genkitError);
          toast({ title: "Error del Vigilante de Ruta", description: "No se pudo iniciar la vigilancia para esta ruta.", variant: "destructive" });
        });
      } catch (error) {
        console.error("Error setting up route watcher:", error);
        toast({ title: "Error", description: "No se pudo configurar el vigilante de ruta.", variant: "destructive" });
      }

    } else {
      toast({ title: "Error al Guardar Ruta", description: result.error || "No se pudo guardar la ruta en la base de datos.", variant: "destructive" });
    }
    setIsSubmittingForm(false);
  }
  
  const removeRoute = async (idToRemove: string) => {
    const result = await deleteSavedRouteAction(idToRemove);
    if (result.success) {
      setSavedRoutesUI(prev => prev.filter(route => route.id !== idToRemove));
      toast({ title: "Ruta Eliminada", description: "La ruta guardada ha sido eliminada de la base de datos." });
    } else {
      toast({ title: "Error al Eliminar Ruta", description: result.error || "No se pudo eliminar la ruta.", variant: "destructive" });
    }
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
            Guarda tus rutas frecuentes en la base de datos y recibe notificaciones de nuestro Vigilante de Rutas IA.
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
                        disabled={isLoadingLocations || isSubmittingForm}
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
                        disabled={isLoadingLocations || isSubmittingForm}
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
                          <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")} disabled={isSubmittingForm}>
                            {field.value ? format(field.value, "PPP", { locale: es }) : <span>Cualquier fecha</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus 
                          disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) || isSubmittingForm} locale={es} />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>Deja en blanco para recibir notificaciones para cualquier fecha.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full md:w-auto" size="lg" disabled={isSubmittingForm || isLoadingLocations}>
                <BellRing className="mr-2 h-5 w-5" /> {isSubmittingForm ? "Guardando..." : "Guardar Ruta y Vigilar"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {isLoadingRoutes ? (
        <div className="flex justify-center items-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-3 text-muted-foreground">Cargando rutas guardadas...</p>
        </div>
      ) : savedRoutesUI.length > 0 && (
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Tus Rutas Guardadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {savedRoutesUI.map(route => (
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
