// src/app/dashboard/passenger/search-trips/actions.ts
'use server';

import { supabase } from '@/lib/supabaseClient';
import { z } from 'zod';
import { format, startOfDay, endOfDay } from 'date-fns';

const SearchFiltersSchema = z.object({
  origin: z.string().optional(),
  destination: z.string().optional(),
  date: z.string().optional(), // Date as ISO string or YYYY-MM-DD
});

export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

export interface TripSearchResult {
  id: string;
  driverName: string;
  driverAvatar: string | null;
  origin: string;
  destination: string;
  departure_datetime: string; // ISO string
  availableSeats: number;
  // Price is omitted as it's not in the trips table schema
}

const ANY_ORIGIN_VALUE = "_ANY_ORIGIN_";
const ANY_DESTINATION_VALUE = "_ANY_DESTINATION_";

export async function searchSupabaseTrips(filters: SearchFilters): Promise<TripSearchResult[]> {
  try {
    let query = supabase
      .from('trips')
      .select(`
        id,
        origin,
        destination,
        departure_datetime,
        seats_available,
        driver_id,
        profiles (
          full_name,
          avatar_url
        )
      `)
      .gt('seats_available', 0) // Only trips with available seats
      .gt('departure_datetime', new Date().toISOString()) // Only future trips
      .order('departure_datetime', { ascending: true });

    if (filters.origin && filters.origin !== ANY_ORIGIN_VALUE) {
      query = query.eq('origin', filters.origin);
    }

    if (filters.destination && filters.destination !== ANY_DESTINATION_VALUE) {
      query = query.eq('destination', filters.destination);
    }

    if (filters.date) {
      const searchDate = new Date(filters.date);
      const startDate = startOfDay(searchDate).toISOString();
      const endDate = endOfDay(searchDate).toISOString();
      query = query.gte('departure_datetime', startDate).lte('departure_datetime', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching trips from Supabase:", error);
      throw error;
    }

    if (!data) {
      return [];
    }

    // Transform data to match TripSearchResult structure
    const results: TripSearchResult[] = data.map((trip: any) => ({
      id: trip.id,
      origin: trip.origin,
      destination: trip.destination,
      departure_datetime: trip.departure_datetime,
      availableSeats: trip.seats_available,
      driverName: trip.profiles?.full_name || 'Conductor Desconocido',
      driverAvatar: trip.profiles?.avatar_url || `https://placehold.co/100x100.png?text=${(trip.profiles?.full_name || 'CD').substring(0,2).toUpperCase()}`,
    }));

    return results;

  } catch (error) {
    console.error('Error in searchSupabaseTrips:', error);
    return []; // Return empty array on error
  }
}
