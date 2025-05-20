// src/app/dashboard/passenger/saved-routes/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { LOCATIONS, Location } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, MapPin, BookmarkPlus, BellRing, Trash2, Route } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { watchRoute, type WatchRouteInput } from "@/ai/flows/route-watcher"; // Import GenAI flow

const SavedRouteSchema = z.object({
  origin: z.custom<Location>((val) => LOCATIONS.includes(val as Location), {
    message: "Please select a valid origin.",
  }),
  destination: z.custom<Location>((val) => LOCATIONS.includes(val as Location), {
    message: "Please select a valid destination.",
  }),
  date: z.date().optional(), // Date is optional for a saved route preference
}).refine(data => data.origin !== data.destination, {
  message: "Origin and destination cannot be the same.",
  path: ["destination"],
});

interface SavedRouteItem extends z.infer<typeof SavedRouteSchema> {
  id: string;
}

export default function SavedRoutesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [savedRoutes, setSavedRoutes] = useState<SavedRouteItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof SavedRouteSchema>>({
    resolver: zodResolver(SavedRouteSchema),
  });

  async function onSubmit(data: z.infer<typeof SavedRouteSchema>) {
    if (!user?.email) {
      toast({ title: "Error", description: "User email not found. Please log in again.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    const newSavedRoute: SavedRouteItem = { ...data, id: Date.now().toString() };
    setSavedRoutes(prev => [...prev, newSavedRoute]);
    form.reset();
    
    toast({
      title: "Route Saved!",
      description: `Route from ${data.origin} to ${data.destination} saved. We'll notify you of matching trips.`,
      variant: "default"
    });

    // Call the GenAI Route Watcher
    try {
      const watchInput: WatchRouteInput = {
        passengerEmail: user.email,
        origin: data.origin,
        destination: data.destination,
        date: data.date ? format(data.date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"), // Provide a date; current if not specified
      };
      
      // Intentionally not awaiting this for a background "watching" feel
      watchRoute(watchInput).then(output => {
        // This is a conceptual notification. In a real app, the AI might trigger
        // a backend process that sends emails/push notifications later.
        // For now, we'll show a toast based on the immediate (simulated) response.
        if (output.routeMatchFound) {
           toast({
            title: "Route Watcher Active!",
            description: output.message,
            variant: output.notificationSent ? "default" : "destructive",
            duration: 7000,
            action: output.notificationSent ? <Button variant="outline" size="sm" onClick={() => console.log("Notification action clicked")}>View Matches</Button> : undefined
          });
        } else {
           toast({
            title: "Route Watcher Update",
            description: output.message || "Monitoring your saved route for new trips.",
            variant: "default",
            duration: 5000
          });
        }
      }).catch(error => {
        console.error("Error calling watchRoute:", error);
        toast({
          title: "Route Watcher Error",
          description: "Could not start watching the route. Please try again.",
          variant: "destructive",
        });
      });

    } catch (error) {
      console.error("Error setting up route watcher:", error);
      toast({
        title: "Error",
        description: "Failed to set up route watcher.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }
  
  const removeRoute = (id: string) => {
    setSavedRoutes(prev => prev.filter(route => route.id !== id));
    toast({ title: "Route Removed", description: "The saved route has been removed." });
  };

  return (
    <div className="space-y-8">
      <Card className="w-full max-w-2xl mx-auto shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <BookmarkPlus className="h-8 w-8 text-primary" />
            <CardTitle className="text-2xl font-bold">Save a Preferred Route</CardTitle>
          </div>
          <CardDescription>
            Save your frequent routes and get notified by our AI Route Watcher when matching trips are posted.
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
                      <FormLabel className="flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground" /> Origin</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select origin" /></SelectTrigger></FormControl>
                        <SelectContent>{LOCATIONS.map(loc => <SelectItem key={`sro-${loc}`} value={loc}>{loc}</SelectItem>)}</SelectContent>
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
                      <FormLabel className="flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground" /> Destination</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger></FormControl>
                        <SelectContent>{LOCATIONS.map(loc => <SelectItem key={`srd-${loc}`} value={loc}>{loc}</SelectItem>)}</SelectContent>
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
                    <FormLabel className="flex items-center gap-1"><CalendarIcon className="h-4 w-4 text-muted-foreground" /> Preferred Date (Optional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP") : <span>Any date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus 
                          disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>Leave blank to be notified for any date.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full md:w-auto" size="lg" disabled={isSubmitting}>
                <BellRing className="mr-2 h-5 w-5" /> {isSubmitting ? "Saving..." : "Save Route & Watch"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {savedRoutes.length > 0 && (
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Your Saved Routes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {savedRoutes.map(route => (
              <div key={route.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Route className="h-6 w-6 text-primary"/>
                  <div>
                    <p className="font-medium">{route.origin} to {route.destination}</p>
                    <p className="text-sm text-muted-foreground">
                      Date: {route.date ? format(route.date, "PPP") : "Any"}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeRoute(route.id)} aria-label="Remove saved route">
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
