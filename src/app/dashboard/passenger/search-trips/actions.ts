
// src/app/dashboard/passenger/search-trips/actions.ts
'use server';

import { supabase } from '@/lib/supabaseClient';
import { z } from 'zod';
import { format, startOfDay, endOfDay, parseISO } from 'date-fns';

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
}

// Estos valores deben coincidir con los usados en el componente de la página
const ANY_ORIGIN_VALUE = "_ANY_ORIGIN_";
const ANY_DESTINATION_VALUE = "_ANY_DESTINATION_";

export async function searchSupabaseTrips(filters: SearchFilters): Promise<TripSearchResult[]> {
  console.log('[searchSupabaseTrips] Received filters for RPC call:', JSON.stringify(filters, null, 2));

  const params = {
    p_origin: (filters.origin && filters.origin !== ANY_ORIGIN_VALUE) ? filters.origin : null,
    p_destination: (filters.destination && filters.destination !== ANY_DESTINATION_VALUE) ? filters.destination : null,
    p_search_date_str: (filters.date && filters.date !== "") ? filters.date : null,
  };

  console.log('[searchSupabaseTrips] Parameters for RPC call search_trips_with_driver_info:', params);

  try {
    const { data, error } = await supabase.rpc('search_trips_with_driver_info', params);

    if (error) {
      console.error("[searchSupabaseTrips] Error calling RPC search_trips_with_driver_info:", JSON.stringify(error, null, 2));
      if (error.message.includes("function public.search_trips_with_driver_info") && error.message.includes("does not exist")) {
        console.error("[searchSupabaseTrips] RPC function not found. Did you run the SQL to create it and refresh the schema in Supabase API settings?");
      }
      throw error;
    }

    console.log('[searchSupabaseTrips] Raw data from RPC:', data ? `${data.length} rows` : 'No data');
    if (data && data.length > 0) {
        console.log('[searchSupabaseTrips] First raw row from RPC:', JSON.stringify(data[0], null, 2));
        if (data[0].driver_name === null && data[0].driver_avatar === null) {
            console.warn("[searchSupabaseTrips] Warning: First trip's driver_name and driver_avatar are both null. Check JOIN condition or data in profiles table for driver_id:", data[0].driver_id);
        }
        // El log de keys de profiles se eliminó porque ahora los campos vienen directamente.
    }

    if (!data) {
      return [];
    }

    const results: TripSearchResult[] = data.map((trip_from_rpc: any) => {
      let driverAvatar = trip_from_rpc.driver_avatar;
      const driverName = trip_from_rpc.driver_name || 'Conductor Desconocido';

      // Ensure driverAvatar is not undefined or an empty string before using it.
      // If it's null, undefined, or empty, generate a placeholder.
      if (!driverAvatar || (typeof driverAvatar === 'string' && driverAvatar.trim() === '')) {
        const initials = (driverName.substring(0, 2) || 'CD').toUpperCase();
        driverAvatar = `https://placehold.co/100x100.png?text=${encodeURIComponent(initials)}`;
      }
      // If driverAvatar was a valid non-empty string, it remains unchanged.

      return {
        id: trip_from_rpc.id,
        origin: trip_from_rpc.origin,
        destination: trip_from_rpc.destination,
        departure_datetime: trip_from_rpc.departure_datetime,
        availableSeats: trip_from_rpc.seats_available,
        driverName: driverName,
        driverAvatar: driverAvatar,
      };
    }).filter(trip => trip.id); 
    
    console.log('[searchSupabaseTrips] Transformed results from RPC:', results.length > 0 ? `${results.length} results, first: ${JSON.stringify(results[0], null, 2)}` : 'No results after transformation.');
    return results;

  } catch (error) {
    console.error('[searchSupabaseTrips] Catch-all error in searchSupabaseTrips (RPC path):', error);
    return [];
  }
}
