
// src/app/dashboard/passenger/search-trips/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TripCard } from "@/components/TripCard"; 
import type { TripSearchResult } from "./actions"; 
import { searchSupabaseTrips, requestTripSeatAction } from "./actions"; 
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { format as formatDateFns } from "date-fns"; 
import { es } from "date-fns/locale/es";
import { CalendarIcon, MapPin, SearchIcon, Loader2 } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient"; 

const SearchFiltersSchemaClient = z.object({
  origin: z.string().optional(),
  destination: z.string().optional(),
  date: z.date().optional(), 
});

type SearchFiltersClient = z.infer<typeof SearchFiltersSchemaClient>;

interface LocationOption {
  nombre: string;
}

const ANY_ORIGIN_VALUE = "_ANY_ORIGIN_";
const ANY_DESTINATION_VALUE = "_ANY_DESTINATION_";

export default function SearchTripsPage() {
  const { toast } = useToast();
  const [filteredTrips, setFilteredTrips] = useState<TripSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true); // For initial page load state
  const [isSearching, setIsSearching] = useState(false); // For active search operation
  const [isSubmittingRequestId, setIsSubmittingRequestId] = useState<string | null>(null);
  const [origins, setOrigins] = useState<LocationOption[]>([]);
  const [destinations, setDestinations] = useState<LocationOption[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);

  const form = useForm<SearchFiltersClient>({
    resolver: zodResolver(SearchFiltersSchemaClient),
    defaultValues: {
      origin: ANY_ORIGIN_VALUE,
      destination: ANY_DESTINATION_VALUE,
      date: undefined,
    }
  });

  const performSearch = useCallback(async (searchData?: SearchFiltersClient) => {
    setIsSearching(true);
    const currentFilters = searchData || form.getValues();
    const serverFilters = {
      origin: currentFilters.origin,
      destination: currentFilters.destination,
      date: currentFilters.date ? formatDateFns(currentFilters.date, "yyyy-MM-dd") : undefined,
    };

    try {
      const trips = await searchSupabaseTrips(serverFilters);
      setFilteredTrips(trips);
      if (searchData) { // Only show toast for manual searches initiated by user
        toast({
          title: trips.length > 0 ? "Búsqueda Actualizada" : "No se encontraron viajes",
          description: trips.length > 0 
            ? `Se encontraron ${trips.length} viaje(s) que coinciden con tus criterios.`
            : "Intenta con otros filtros o no hay viajes para tu selección.",
        });
      }
    } catch (error: any) {
       toast({
        title: "Error en la Búsqueda",
        description: error.message || "Ocurrió un error al buscar viajes.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  }, [toast, form]); // form is stable, toast is stable

  // Effect for initial data loading (locations and first set of trips)
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setIsLoadingLocations(true);

    async function fetchInitialData() {
      try {
        // Fetch locations
        const { data: originsData, error: originsError } = await supabase
          .from('origen')
          .select('nombre')
          .eq('estado', true);
        if (originsError && isMounted) throw originsError;
        if (isMounted) setOrigins(originsData || []);

        const { data: destinationsData, error: destinationsError } = await supabase
          .from('destino')
          .select('nombre')
          .eq('estado', true);
        if (destinationsError && isMounted) throw destinationsError;
        if (isMounted) setDestinations(destinationsData || []);
        
      } catch (error: any) {
        if (isMounted) {
          console.error("Error fetching locations for Search Trips:", error);
          toast({
            title: "Error al Cargar Ubicaciones",
            description: error.message || "No se pudieron obtener los orígenes/destinos.",
            variant: "destructive",
          });
        }
      } finally {
        if (isMounted) setIsLoadingLocations(false);
      }

      // Fetch initial trips (all available by default)
      // We pass undefined to performSearch to use default filters (all trips)
      // and false for the second argument to suppress the toast for initial load.
      const initialServerFilters = {
        origin: ANY_ORIGIN_VALUE,
        destination: ANY_DESTINATION_VALUE,
        date: undefined,
      };
       try {
        const trips = await searchSupabaseTrips(initialServerFilters);
        if (isMounted) {
          setFilteredTrips(trips);
          if (trips.length === 0) {
            toast({
                title: "No hay viajes disponibles",
                description: "Actualmente no hay viajes futuros publicados. ¡Vuelve más tarde!",
            });
          }
        }
      } catch (error: any) {
        if (isMounted) {
          toast({
            title: "Error al Cargar Viajes Iniciales",
            description: error.message || "Ocurrió un error al cargar los viajes.",
            variant: "destructive",
          });
        }
      } finally {
        if (isMounted) setIsLoading(false); // This marks the end of the initial page load
      }
    }

    fetchInitialData();
    
    return () => { isMounted = false; };
  }, [toast]); // Only runs once on mount

  const onSubmit = async (data: SearchFiltersClient) => {
    await performSearch(data);
  };
  
  const handleRequestRide = async (tripId: string) => {
    setIsSubmittingRequestId(tripId);
    try {
      const result = await requestTripSeatAction(tripId);
      toast({
        title: result.success ? (result.alreadyRequested ? "Información" : "¡Viaje Solicitado!") : "Error en Solicitud",
        description: result.message,
        variant: result.success ? "default" : "destructive"
      });

      if (result.success && !result.alreadyRequested) {
        // Re-fetch trips to update available seats using current filters
        await performSearch(form.getValues());
      }
    } catch (error: any) {
      toast({
        title: "Error Inesperado",
        description: "Ocurrió un error al procesar tu solicitud: " + error.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmittingRequestId(null);
    }
  };

  const clearFiltersAndFetchAll = async () => {
    form.reset({ 
      origin: ANY_ORIGIN_VALUE, 
      destination: ANY_DESTINATION_VALUE, 
      date: undefined 
    });
    // Pass undefined to performSearch to signify it's a 'clear filters' action using default/all trips logic
    // The true argument is to show a toast for this manual action.
    await performSearch(form.getValues()); // Will use the reset values
    toast({ title: "Filtros Limpiados", description: "Mostrando todos los viajes disponibles."});
  };

  return (
    <div className="space-y-8">
      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <SearchIcon className="h-8 w-8 text-primary" />
            <CardTitle className="text-2xl font-bold">Buscar Viajes</CardTitle>
          </div>
          <CardDescription>
            Encuentra viajes disponibles filtrando por origen, destino y fecha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="origin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground" /> Origen</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value || ANY_ORIGIN_VALUE}
                        disabled={isLoadingLocations || isSearching || isLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingLocations ? "Cargando..." : "Cualquier Origen"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingLocations ? (
                            <SelectItem value="loading_placeholder" disabled>Cargando...</SelectItem>
                          ) : (
                            <>
                              <SelectItem value={ANY_ORIGIN_VALUE}>Cualquier Origen</SelectItem>
                              {origins.map((location) => (
                                <SelectItem key={`origin-${location.nombre}`} value={location.nombre}>
                                  {location.nombre}
                                </SelectItem>
                              ))}
                            </>
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
                        value={field.value || ANY_DESTINATION_VALUE}
                        disabled={isLoadingLocations || isSearching || isLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingLocations ? "Cargando..." : "Cualquier Destino"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingLocations ? (
                            <SelectItem value="loading_placeholder_dest" disabled>Cargando...</SelectItem>
                          ) : (
                            <>
                              <SelectItem value={ANY_DESTINATION_VALUE}>Cualquier Destino</SelectItem>
                              {destinations.map((location) => (
                                <SelectItem key={`dest-${location.nombre}`} value={location.nombre}>
                                  {location.nombre}
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="flex items-center gap-1"><CalendarIcon className="h-4 w-4 text-muted-foreground" /> Fecha</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              disabled={isSearching || isLoading}
                            >
                              {field.value ? formatDateFns(field.value, "PPP", { locale: es }) : <span>Cualquier Fecha</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar 
                            mode="single" 
                            selected={field.value} 
                            onSelect={field.onChange} 
                            initialFocus 
                            locale={es}
                            disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) || isSearching || isLoading} 
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={clearFiltersAndFetchAll} 
                    disabled={isSearching || isLoadingLocations || isLoading}>
                  Limpiar Filtros
                </Button>
                <Button type="submit" disabled={isSearching || isLoadingLocations || isLoading}>
                  {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} 
                  {isSearching ? "Buscando..." : "Buscar Viajes"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {isLoading ? ( // Show loader if initial page load is in progress
         <div className="flex justify-center items-center h-64">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg text-muted-foreground">Cargando viajes disponibles...</p>
        </div>
      ) : filteredTrips.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTrips.map((trip) => (
            <TripCard 
                key={trip.id} 
                trip={{
                    id: trip.id,
                    driverName: trip.driverName,
                    driverAvatar: trip.driverAvatar,
                    origin: trip.origin,
                    destination: trip.destination,
                    date: new Date(trip.departure_datetime), 
                    availableSeats: trip.availableSeats,
                }} 
                onRequestRide={handleRequestRide}
                isRequesting={isSubmittingRequestId === trip.id}
            />
          ))}
        </div>
      ) : ( // Shown if not loading and no trips were found (after initial load or a search)
        <Card className="text-center py-12 shadow-md">
          <CardContent>
            <SearchIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No se Encontraron Viajes</h3>
            <p className="text-muted-foreground">
              Intenta ajustar tus filtros de búsqueda o no hay viajes disponibles actualmente con esos criterios.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

