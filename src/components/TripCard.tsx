
// src/components/TripCard.tsx
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, MapPin, Users, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale/es";
import Image from "next/image";

export interface Trip {
  id: string;
  driverName: string;
  driverAvatar: string;
  origin: string; 
  destination: string; 
  date: Date;
  availableSeats: number;
  price?: number; 
}

interface TripCardProps {
  trip: Trip;
  onRequestRide: (tripId: string) => void;
}

export function TripCard({ trip, onRequestRide }: TripCardProps) {
  return (
    <Card className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
      <div className="relative h-40 w-full">
        <Image 
          src={`https://placehold.co/600x240.png?text=${trip.origin}+a+${trip.destination}`} 
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
            src={trip.driverAvatar} 
            alt={trip.driverName} 
            width={40} 
            height={40} 
            className="rounded-full border-2 border-primary"
            data-ai-hint="profile person"
          />
          <div>
            <CardTitle className="text-xl">{trip.driverName}</CardTitle>
            <CardDescription>Conductor(a)</CardDescription>
          </div>
        </div>
        <div className="flex items-center justify-between text-lg font-semibold text-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-5 w-5 text-primary"/>{trip.origin}</span>
          <ArrowRight className="h-5 w-5 text-muted-foreground"/>
          <span className="flex items-center gap-1"><MapPin className="h-5 w-5 text-primary"/>{trip.destination}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 flex-grow">
        <div className="flex items-center text-muted-foreground">
          <CalendarDays className="mr-2 h-5 w-5" />
          <span>{format(trip.date, "PPP", { locale: es })}</span>
        </div>
        <div className="flex items-center text-muted-foreground">
          <Users className="mr-2 h-5 w-5" />
          <span>{trip.availableSeats} {trip.availableSeats === 1 ? 'asiento disponible' : 'asientos disponibles'}</span>
        </div>
        {trip.price && (
          <p className="text-lg font-semibold text-accent">
            ${trip.price.toFixed(2)} por asiento
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button className="w-full" size="lg" onClick={() => onRequestRide(trip.id)}>
          Solicitar Viaje
        </Button>
      </CardFooter>
    </Card>
  );
}
    
