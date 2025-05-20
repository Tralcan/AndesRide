// src/app/dashboard/passenger/search-trips/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TripCard, type Trip } from "@/components/TripCard";
import { useToast } from "@/hooks/use-toast";
import { LOCATIONS, Location } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, MapPin, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const SearchFiltersSchema = z.object({
  origin: z.custom<Location>().optional(),
  destination: z.custom<Location>().optional(),
  date: z.date().optional(),
});

// Mock data for trips
const MOCK_TRIPS: Trip[] = [
  { id: "1", driverName: "Maria G.", driverAvatar: "https://placehold.co/100x100.png?text=MG", origin: "Bogotá", destination: "Medellín", date: new Date(2024, 7, 15), availableSeats: 2, price: 25 },
  { id: "2", driverName: "Carlos R.", driverAvatar: "https://placehold.co/100x100.png?text=CR", origin: "Cali", destination: "Pereira", date: new Date(2024, 7, 16), availableSeats: 3, price: 18 },
  { id: "3", driverName: "Sofia L.", driverAvatar: "https://placehold.co/100x100.png?text=SL", origin: "Barranquilla", destination: "Cartagena", date: new Date(2024, 7, 18), availableSeats: 1, price: 12 },
  { id: "4", driverName: "Luis F.", driverAvatar: "https://placehold.co/100x100.png?text=LF", origin: "Medellín", destination: "Bogotá", date: new Date(2024, 7, 20), availableSeats: 4, price: 22 },
];

export default function SearchTripsPage() {
  const { toast } = useToast();
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>(MOCK_TRIPS);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof SearchFiltersSchema>>({
    resolver: zodResolver(SearchFiltersSchema),
  });

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
        title: "Search Updated",
        description: `Found ${trips.length} trip(s) matching your criteria.`,
      });
    }, 500);
  };
  
  const handleRequestRide = (tripId: string) => {
    const trip = MOCK_TRIPS.find(t => t.id === tripId);
    toast({
      title: "Ride Requested!",
      description: `Your request for the trip from ${trip?.origin} to ${trip?.destination} has been sent to ${trip?.driverName}.`,
      variant: "default"
    });
  };

  // Load all trips initially
  useEffect(() => {
    setFilteredTrips(MOCK_TRIPS);
  }, []);

  return (
    <div className="space-y-8">
      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <SearchIcon className="h-8 w-8 text-primary" />
            <CardTitle className="text-2xl font-bold">Search for Trips</CardTitle>
          </div>
          <CardDescription>
            Find available rides by filtering by origin, destination, and date.
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
                      <FormLabel className="flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground" /> Origin</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Any Origin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LOCATIONS.map((location) => (
                            <SelectItem key={`origin-${location}`} value={location}>
                              {location}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="destination"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground" /> Destination</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Any Destination" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LOCATIONS.map((location) => (
                            <SelectItem key={`dest-${location}`} value={location}>
                              {location}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="flex items-center gap-1"><CalendarIcon className="h-4 w-4 text-muted-foreground" /> Date</FormLabel>
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
                              {field.value ? format(field.value, "PPP") : <span>Any Date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                        </PopoverContent>
                      </Popover>
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => {form.reset(); setFilteredTrips(MOCK_TRIPS);}} disabled={isLoading}>
                  Clear Filters
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Searching..." : "Search Trips"}
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
            <h3 className="text-xl font-semibold mb-2">No Trips Found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search filters or check back later.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
