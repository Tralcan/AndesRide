
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

const ANY_ORIGIN_VALUE = "_ANY_ORIGIN_";
const ANY_DESTINATION_VALUE = "_ANY_DESTINATION_";

export async function searchSupabaseTrips(filters: SearchFilters): Promise<TripSearchResult[]> {
  console.log('[searchSupabaseTrips] Received filters:', JSON.stringify(filters, null, 2));

  let queryLogParts: string[] = [];
  queryLogParts.push("SELECT id, origin, destination, departure_datetime, seats_available, driver_id, profiles (full_name, avatar_url)");
  queryLogParts.push("FROM trips");

  let whereClauses: string[] = [];
  whereClauses.push("seats_available > 0");
  whereClauses.push(`departure_datetime > '${new Date().toISOString()}'`);

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
      .gt('seats_available', 0)
      .gt('departure_datetime', new Date().toISOString());

    if (filters.origin && filters.origin !== ANY_ORIGIN_VALUE) {
      console.log(`[searchSupabaseTrips] Applying origin filter: ${filters.origin}`);
      query = query.eq('origin', filters.origin);
      whereClauses.push(`origin = '${filters.origin}'`);
    } else {
      console.log('[searchSupabaseTrips] No origin filter or ANY_ORIGIN selected.');
    }

    if (filters.destination && filters.destination !== ANY_DESTINATION_VALUE) {
      console.log(`[searchSupabaseTrips] Applying destination filter: ${filters.destination}`);
      query = query.eq('destination', filters.destination);
      whereClauses.push(`destination = '${filters.destination}'`);
    } else {
      console.log('[searchSupabaseTrips] No destination filter or ANY_DESTINATION selected.');
    }

    if (filters.date) {
      try {
        // Ensure the date is parsed correctly and represent the full day in UTC or local timezone consistently
        // For Supabase, it's often easier to work with ISO strings directly.
        // The date from the client is YYYY-MM-DD.
        const searchDate = parseISO(filters.date); // This will parse it as UTC midnight if no time is specified.
                                               // If your departure_datetime is stored in local time, this might need adjustment.
        
        if (isNaN(searchDate.getTime())) {
            console.warn(`[searchSupabaseTrips] Invalid date string received: ${filters.date}. Skipping date filter.`);
        } else {
            const startDate = startOfDay(searchDate).toISOString(); // Start of the day in UTC
            const endDate = endOfDay(searchDate).toISOString();     // End of the day in UTC
            console.log(`[searchSupabaseTrips] Applying date filter: BETWEEN ${startDate} AND ${endDate}`);
            query = query.gte('departure_datetime', startDate).lte('departure_datetime', endDate);
            whereClauses.push(`departure_datetime BETWEEN '${startDate}' AND '${endDate}'`);
        }
      } catch (dateError) {
        console.warn(`[searchSupabaseTrips] Error processing date filter for value "${filters.date}":`, dateError, ". Skipping date filter.");
      }
    } else {
      console.log('[searchSupabaseTrips] No date filter selected.');
    }

    query = query.order('departure_datetime', { ascending: true });
    queryLogParts.push(`WHERE ${whereClauses.join(' AND ')}`);
    queryLogParts.push("ORDER BY departure_datetime ASC");

    console.log("--- Query Construction Log ---");
    queryLogParts.forEach(part => console.log(part));
    console.log("-----------------------------");

    const { data, error } = await query;

    if (error) {
      console.error("[searchSupabaseTrips] Error fetching trips from Supabase:", JSON.stringify(error, null, 2));
      // Check if the error might be related to RLS (though this specific error was about FK)
      if (error.message.includes("security policy") || error.message.includes("RLS")) {
          console.error("[searchSupabaseTrips] Potential Row Level Security issue. Ensure 'trips' and 'profiles' tables have appropriate SELECT policies for the 'anon' role or authenticated users.");
      }
      throw error;
    }

    console.log('[searchSupabaseTrips] Raw data from Supabase:', data ? `${data.length} rows` : 'No data');
    if (data && data.length > 0) {
        console.log('[searchSupabaseTrips] First raw row:', JSON.stringify(data[0], null, 2));
    }


    if (!data) {
      return [];
    }

    const results: TripSearchResult[] = data.map((trip: any) => {
      const driverName = trip.profiles?.full_name || 'Conductor Desconocido';
      // Ensure driverAvatar is a string or null, not undefined
      let driverAvatar = trip.profiles?.avatar_url;
      if (driverAvatar === undefined || driverAvatar === '') {
        driverAvatar = null; // Explicitly set to null if undefined or empty
      }
      
      // If still null, generate placeholder
      if (driverAvatar === null) {
        const initials = (driverName.substring(0, 2) || 'CD').toUpperCase();
        driverAvatar = `https://placehold.co/100x100.png?text=${initials}`;
      }

      return {
        id: trip.id,
        origin: trip.origin,
        destination: trip.destination,
        departure_datetime: trip.departure_datetime,
        availableSeats: trip.seats_available,
        driverName: driverName,
        driverAvatar: driverAvatar,
      };
    }).filter(trip => trip.id); // Ensure trip has an id
    
    console.log('[searchSupabaseTrips] Transformed results:', results.length > 0 ? `${results.length} results, first: ${JSON.stringify(results[0], null, 2)}` : 'No results after transformation.');
    return results;

  } catch (error) {
    console.error('[searchSupabaseTrips] Catch-all error in searchSupabaseTrips:', error);
    return [];
  }
}
