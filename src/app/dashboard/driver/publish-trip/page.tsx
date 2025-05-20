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
import { LOCATIONS, Location } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, MapPin, Users, PlusCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";

const TripFormSchema = z.object({
  origin: z.custom<Location>((val) => LOCATIONS.includes(val as Location), {
    message: "Please select a valid origin.",
  }),
  destination: z.custom<Location>((val) => LOCATIONS.includes(val as Location), {
    message: "Please select a valid destination.",
  }),
  date: z.date({
    required_error: "A date for the trip is required.",
  }),
  seats: z.coerce.number().min(1, "At least 1 seat must be available.").max(10, "Maximum 10 seats."),
}).refine(data => data.origin !== data.destination, {
  message: "Origin and destination cannot be the same.",
  path: ["destination"], // Or apply to 'origin' or make it a form-level error
});

export default function PublishTripPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<z.infer<typeof TripFormSchema>>({
    resolver: zodResolver(TripFormSchema),
    defaultValues: {
      seats: 1,
    },
  });

  async function onSubmit(data: z.infer<typeof TripFormSchema>) {
    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("Trip data submitted:", data);
    toast({
      title: "Trip Published!",
      description: `Your trip from ${data.origin} to ${data.destination} on ${format(data.date, "PPP")} has been successfully published.`,
      variant: "default"
    });
    form.reset({ seats: 1 }); // Reset form after successful submission
    setIsSubmitting(false);
  }

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <PlusCircle className="h-8 w-8 text-primary" />
          <CardTitle className="text-2xl font-bold">Publish a New Trip</CardTitle>
        </div>
        <CardDescription>
          Fill in the details below to offer a ride to fellow travelers.
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
                      <MapPin className="h-4 w-4 text-muted-foreground" /> Origin
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select origin city" />
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
                      <MapPin className="h-4 w-4 text-muted-foreground" /> Destination
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select destination city" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LOCATIONS.map((location) => (
                          <SelectItem key={`destination-${location}`} value={location}>
                            {location}
                          </SelectItem>
                        ))}
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
                     <CalendarIcon className="h-4 w-4 text-muted-foreground" /> Date of Trip
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
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
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
                        disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) } // Disable past dates
                        initialFocus
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
                    <Users className="h-4 w-4 text-muted-foreground" /> Available Seats
                  </FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 2" {...field} min="1" max="10" />
                  </FormControl>
                  <FormDescription>
                    Enter the number of seats you are offering for this trip.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full md:w-auto" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Publishing..." : "Publish Trip"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
