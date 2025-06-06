// src/components/TripCard.tsx
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, MapPin, Users, ArrowRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale/es";
import Image from "next/image";

export interface Trip {
  id: string;
  driverName: string | null;
  driverAvatar: string | null; 
  origin: string;
  destination: string;
  date: Date; 
  availableSeats: number;
  price?: number; 
}

interface TripCardProps {
  trip: Trip;
  onRequestRide: (tripId: string) => void;
  isRequesting?: boolean; // New prop to indicate if a request is in progress for this trip
}

export function TripCard({ trip, onRequestRide, isRequesting = false }: TripCardProps) {
  const driverInitial = trip.driverName?.substring(0, 2).toUpperCase() || '??';
  const avatarSrc = trip.driverAvatar || `https://placehold.co/100x100.png?text=${encodeURIComponent(driverInitial)}`;

  const noSeatsAvailable = trip.availableSeats <= 0;

  let formattedDepartureDateTime = "Fecha inválida";
  if (trip.date instanceof Date && !isNaN(trip.date.getTime())) {
    const originalUtcDate = trip.date;
    const year = originalUtcDate.getUTCFullYear();
    const month = originalUtcDate.getUTCMonth(); // 0-indexed
    const day = originalUtcDate.getUTCDate();
    const hours = originalUtcDate.getUTCHours();
    const minutes = originalUtcDate.getUTCMinutes();
    
    // Create a new Date object using the UTC components.
    // This "tricks" date-fns format into displaying these values as if they were local.
    const dateForDisplay = new Date(year, month, day, hours, minutes);
    formattedDepartureDateTime = format(dateForDisplay, "PPP 'a las' HH:mm", { locale: es });
  }


  return (
    <Card className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
      <div className="relative h-40 w-full">
        <Image
          src={`https://placehold.co/600x240.png?text=${encodeURIComponent(trip.origin)}+a+${encodeURIComponent(trip.destination)}`}
          alt={`Mapa ilustrando el viaje de ${trip.origin} a ${trip.destination}`}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          data-ai-hint="map route"
        />
      </div>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3 mb-2">
          <Image
            src={avatarSrc}
            alt={trip.driverName || 'Conductor'}
            width={40}
            height={40}
            className="rounded-full border-2 border-primary bg-muted"
            data-ai-hint="profile person"
          />
          <div>
            <CardTitle className="text-xl">{trip.driverName || 'Conductor Anónimo'}</CardTitle>
            <CardDescription>Conductor(a)</CardDescription>
          </div>
        </div>
        <div className="flex items-center justify-between text-base font-semibold text-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-5 w-5 text-primary"/>{trip.origin}</span>
          <ArrowRight className="h-5 w-5 text-muted-foreground"/>
          <span className="flex items-center gap-1"><MapPin className="h-5 w-5 text-primary"/>{trip.destination}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 flex-grow">
        <div className="flex items-center text-muted-foreground">
          <CalendarDays className="mr-2 h-5 w-5" />
          <span>{formattedDepartureDateTime}</span>
        </div>
        <div className="flex items-center text-muted-foreground">
          <Users className="mr-2 h-5 w-5" />
          <span>{trip.availableSeats} {trip.availableSeats === 1 ? 'asiento disponible' : 'asientos disponibles'}</span>
        </div>
        {typeof trip.price === 'number' && ( 
          <p className="text-lg font-semibold text-accent">
            ${trip.price.toFixed(2)} por asiento
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full" 
          size="lg" 
          onClick={() => onRequestRide(trip.id)}
          disabled={isRequesting || noSeatsAvailable}
        >
          {isRequesting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Procesando...
            </>
          ) : noSeatsAvailable ? (
            "Sin Cupos"
          ) : (
            "Solicitar Viaje"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
