
// src/app/dashboard/passenger/search-trips/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TripCard, type Trip } from "@/components/TripCard";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { es } from "date-fns/locale/es";
import { CalendarIcon, MapPin, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";

const SearchFiltersSchema = z.object({
  origin: z.string().optional(),
  destination: z.string().optional(),
  date: z.date().optional(),
});

interface LocationOption {
  nombre: string;
}

// Mock data for trips - Ensure these string values match potential dynamic values
const MOCK_TRIPS: Trip[] = [
  { id: "1", driverName: "Maria G.", driverAvatar: "https://placehold.co/100x100.png?text=MG", origin: "Bogotá", destination: "Medellín", date: new Date(2024, 7, 15), availableSeats: 2, price: 25 },
  { id: "2", driverName: "Carlos R.", driverAvatar: "https://placehold.co/100x100.png?text=CR", origin: "Cali", destination: "Pereira", date: new Date(2024, 7, 16), availableSeats: 3, price: 18 },
  { id: "3", driverName: "Sofia L.", driverAvatar: "https://placehold.co/100x100.png?text=SL", origin: "Barranquilla", destination: "Cartagena", date: new Date(2024, 7, 18), availableSeats: 1, price: 12 },
  { id: "4", driverName: "Luis F.", driverAvatar: "https://placehold.co/100x100.png?text=LF", origin: "Medellín", destination: "Bogotá", date: new Date(2024, 7, 20), availableSeats: 4, price: 22 },
];

export default function SearchTripsPage() {
  const { toast } = useToast();
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>(MOCK_TRIPS);
  const [isLoading, setIsLoading] = useState(false); // For trip search loading
  const [origins, setOrigins] = useState<LocationOption[]>([]);
  const [destinations, setDestinations] = useState<LocationOption[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true); // For location fetching

  const form = useForm<z.infer<typeof SearchFiltersSchema>>({
    resolver: zodResolver(SearchFiltersSchema),
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
        console.error("Error fetching locations for Search Trips:", error);
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

  const onSubmit = (data: z.infer<typeof SearchFiltersSchema>) => {
    setIsLoading(true);
    // Simulate API call / filtering
    setTimeout(() => {
      let trips = MOCK_TRIPS;
      if (data.origin) {
        trips = trips.filter(trip => trip.origin === data.origin);
      }
      if (data.destination) {
        trips = trips.filter(trip => trip.destination === data.destination);
      }
      if (data.date) {
        trips = trips.filter(trip => format(trip.date, "yyyy-MM-dd") === format(data.date as Date, "yyyy-MM-dd"));
      }
      setFilteredTrips(trips);
      setIsLoading(false);
      toast({
        title: "Búsqueda Actualizada",
        description: `Se encontraron ${trips.length} viaje(s) que coinciden con tus criterios.`,
      });
    }, 500);
  };
  
  const handleRequestRide = (tripId: string) => {
    const trip = MOCK_TRIPS.find(t => t.id === tripId);
    toast({
      title: "¡Viaje Solicitado!",
      description: `Tu solicitud para el viaje de ${trip?.origin} a ${trip?.destination} ha sido enviada a ${trip?.driverName}.`,
      variant: "default"
    });
  };

  // Removed redundant useEffect that was setting filteredTrips(MOCK_TRIPS)
  // as useState(MOCK_TRIPS) already handles initial state.

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
                        value={field.value || ""}
                        disabled={isLoadingLocations}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingLocations ? "Cargando..." : "Cualquier Origen"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingLocations ? (
                            <SelectItem value="loading" disabled>Cargando...</SelectItem>
                          ) : (
                            <>
                              <SelectItem value="">Cualquier Origen</SelectItem>
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
                        value={field.value || ""}
                        disabled={isLoadingLocations}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingLocations ? "Cargando..." : "Cualquier Destino"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingLocations ? (
                            <SelectItem value="loading" disabled>Cargando...</SelectItem>
                          ) : (
                            <>
                              <SelectItem value="">Cualquier Destino</SelectItem>
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
                            >
                              {field.value ? format(field.value, "PPP", { locale: es }) : <span>Cualquier Fecha</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={es} />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => {form.reset({ origin: "", destination: "", date: undefined }); setFilteredTrips(MOCK_TRIPS);}} disabled={isLoading || isLoadingLocations}>
                  Limpiar Filtros
                </Button>
                <Button type="submit" disabled={isLoading || isLoadingLocations}>
                  {isLoading ? "Buscando..." : "Buscar Viajes"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {isLoading ? (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => (
            <Card key={i} className="shadow-lg">
              <CardHeader><div className="h-6 w-3/4 bg-muted rounded animate-pulse"></div></CardHeader>
              <CardContent className="space-y-2">
                <div className="h-4 w-full bg-muted rounded animate-pulse"></div>
                <div className="h-4 w-5/6 bg-muted rounded animate-pulse"></div>
              </CardContent>
              <CardFooter><div className="h-10 w-full bg-muted rounded animate-pulse"></div></CardFooter>
            </Card>
          ))}
        </div>
      ) : filteredTrips.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTrips.map((trip) => (
            <TripCard key={trip.id} trip={trip} onRequestRide={handleRequestRide} />
          ))}
        </div>
      ) : (
        <Card className="text-center py-12">
          <CardContent>
            <SearchIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No se Encontraron Viajes</h3>
            <p className="text-muted-foreground">
              Intenta ajustar tus filtros de búsqueda o vuelve más tarde.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
    
