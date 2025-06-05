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

// Estas constantes deben coincidir con las usadas en el frontend
const ANY_ORIGIN_VALUE = "_ANY_ORIGIN_";
const ANY_DESTINATION_VALUE = "_ANY_DESTINATION_";

export async function searchSupabaseTrips(filters: SearchFilters): Promise<TripSearchResult[]> {
  console.log('[searchSupabaseTrips] Received filters:', filters);
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
      console.log(`[searchSupabaseTrips] Applying origin filter: ${filters.origin}`);
      query = query.eq('origin', filters.origin);
    } else {
      console.log('[searchSupabaseTrips] No origin filter or ANY_ORIGIN selected.');
    }

    if (filters.destination && filters.destination !== ANY_DESTINATION_VALUE) {
      console.log(`[searchSupabaseTrips] Applying destination filter: ${filters.destination}`);
      query = query.eq('destination', filters.destination);
    } else {
      console.log('[searchSupabaseTrips] No destination filter or ANY_DESTINATION selected.');
    }

    if (filters.date) {
      try {
        const searchDate = new Date(filters.date + "T00:00:00"); // Ensure parsing as local date
        if (isNaN(searchDate.getTime())) {
            console.warn(`[searchSupabaseTrips] Invalid date string received: ${filters.date}. Skipping date filter.`);
        } else {
            const startDate = startOfDay(searchDate).toISOString();
            const endDate = endOfDay(searchDate).toISOString();
            console.log(`[searchSupabaseTrips] Applying date filter: ${startDate} to ${endDate}`);
            query = query.gte('departure_datetime', startDate).lte('departure_datetime', endDate);
        }
      } catch (dateError) {
        console.warn(`[searchSupabaseTrips] Error processing date filter for value "${filters.date}":`, dateError, ". Skipping date filter.");
      }
    } else {
      console.log('[searchSupabaseTrips] No date filter selected.');
    }

    console.log('[searchSupabaseTrips] Executing query...');
    const { data, error } = await query;

    if (error) {
      console.error("[searchSupabaseTrips] Error fetching trips from Supabase:", error);
      throw error;
    }

    console.log('[searchSupabaseTrips] Query successful. Number of trips fetched:', data?.length);

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
      // Ensure profiles is not null before accessing its properties
      driverName: trip.profiles?.full_name || 'Conductor Desconocido',
      driverAvatar: trip.profiles?.avatar_url || `https://placehold.co/100x100.png?text=${(trip.profiles?.full_name?.substring(0,2) || 'CD').toUpperCase()}`,
    }));
    
    console.log('[searchSupabaseTrips] Transformed results:', results.length > 0 ? results[0] : 'No results to show first item.');
    return results;

  } catch (error) {
    console.error('[searchSupabaseTrips] Catch-all error in searchSupabaseTrips:', error);
    return []; // Return empty array on error
  }
}
