// src/app/dashboard/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { APP_NAME, ROLES } from "@/lib/constants";
import { Car, User, PlusCircle, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function DashboardPage() {
  const { user, role } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-3xl font-bold text-primary">
                {getGreeting()}, {user?.name}!
              </CardTitle>
              <CardDescription className="text-lg text-muted-foreground mt-1">
                Welcome back to {APP_NAME}. Ready for your next journey?
              </CardDescription>
            </div>
            <div className="p-3 bg-primary/10 rounded-full">
              {role === ROLES.DRIVER ? (
                <Car className="h-10 w-10 text-primary" />
              ) : (
                <User className="h-10 w-10 text-primary" />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
           <Image 
            src="https://placehold.co/1200x400.png" 
            alt="Andes mountains scenic view" 
            width={1200} 
            height={400} 
            className="rounded-lg object-cover w-full"
            data-ai-hint="mountains landscape"
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {role === ROLES.DRIVER && (
          <Card className="hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <PlusCircle className="h-6 w-6 text-accent" />
                Publish a New Trip
              </CardTitle>
              <CardDescription>
                Offer a ride to fellow travelers. Set your route, date, and available seats.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/dashboard/driver/publish-trip">Create Trip</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {role === ROLES.PASSENGER && (
          <Card className="hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Search className="h-6 w-6 text-accent" />
                Find a Ride
              </CardTitle>
              <CardDescription>
                Search for available trips based on your preferred origin, destination, and date.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/dashboard/passenger/search-trips">Search Trips</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="hover:shadow-xl transition-shadow">
          <CardHeader>
            <CardTitle className="text-xl">
              {role === ROLES.DRIVER ? "Manage Your Trips" : "Your Bookings"}
            </CardTitle>
            <CardDescription>
              {role === ROLES.DRIVER
                ? "View and manage your published trips and passenger requests."
                : "Keep track of your requested and confirmed rides."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="lg" className="w-full sm:w-auto" disabled>
              View Details (Coming Soon)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
