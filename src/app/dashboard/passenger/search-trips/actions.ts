
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
  // CORRECCIÓN: Cambiado 'full_name' a 'name'. Ajusta si el nombre de tu columna es diferente.
  queryLogParts.push("SELECT id, origin, destination, departure_datetime, seats_available, driver_id, profiles (name, avatar_url)");
  queryLogParts.push("FROM trips");

  let whereClauses: string[] = [];
  const nowISO = new Date().toISOString();
  whereClauses.push("seats_available > 0");
  whereClauses.push(`departure_datetime > '${nowISO}'`);

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
          name, // CORRECCIÓN: Cambiado 'full_name' a 'name'. Ajusta si es otro nombre.
          avatar_url
        )
      `)
      .gt('seats_available', 0)
      .gt('departure_datetime', nowISO);

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
        const searchDate = parseISO(filters.date); // Interpreta YYYY-MM-DD como UTC
        if (isNaN(searchDate.getTime())) {
            console.warn(`[searchSupabaseTrips] Invalid date string received: ${filters.date}. Skipping date filter.`);
        } else {
            const startDate = startOfDay(searchDate).toISOString(); 
            const endDate = endOfDay(searchDate).toISOString();
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
    
    // Logging de la consulta construida
    console.log("--- Query Construction Log ---");
    const finalWhereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : "";
    queryLogParts.push(finalWhereClause);
    queryLogParts.push("ORDER BY departure_datetime ASC");
    queryLogParts.forEach(part => console.log(part));
    console.log("-----------------------------");


    const { data, error } = await query;

    if (error) {
      console.error("[searchSupabaseTrips] Error fetching trips from Supabase:", JSON.stringify(error, null, 2));
      if (error.message.includes("security policy") || error.message.includes("RLS")) {
          console.error("[searchSupabaseTrips] Potential Row Level Security issue. Ensure 'trips' and 'profiles' tables have appropriate SELECT policies for authenticated users or 'anon' role.");
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
      // CORRECCIÓN: Usar 'name' para driverName. Ajusta si es otro nombre.
      const driverName = trip.profiles?.name || trip.profiles?.full_name || 'Conductor Desconocido'; 
      let driverAvatar = trip.profiles?.avatar_url;
      if (driverAvatar === undefined || driverAvatar === '') {
        driverAvatar = null; 
      }
      
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
    }).filter(trip => trip.id); 
    
    console.log('[searchSupabaseTrips] Transformed results:', results.length > 0 ? `${results.length} results, first: ${JSON.stringify(results[0], null, 2)}` : 'No results after transformation.');
    return results;

  } catch (error) {
    console.error('[searchSupabaseTrips] Catch-all error in searchSupabaseTrips:', error);
    return [];
  }
}
