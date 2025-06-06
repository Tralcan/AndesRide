
// src/app/dashboard/passenger/search-trips/actions.ts
'use server';

import { supabase } from '@/lib/supabaseClient';
import { z } from 'zod';
import { cookies } from 'next/headers'; // Import cookies

const SearchFiltersSchema = z.object({
  origin: z.string().optional(),
  destination: z.string().optional(),
  date: z.string().optional(), // Date as ISO string or YYYY-MM-DD
});

export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

export interface TripSearchResult {
  id: string;
  driverName: string | null;
  driverAvatar: string | null;
  origin: string;
  destination:string;
  departure_datetime: string; // ISO string
  availableSeats: number;
}

const ANY_ORIGIN_VALUE = "_ANY_ORIGIN_";
const ANY_DESTINATION_VALUE = "_ANY_DESTINATION_";

export async function searchSupabaseTrips(filters: SearchFilters): Promise<TripSearchResult[]> {
  console.log('[searchSupabaseTrips] Received filters for RPC call:', JSON.stringify(filters, null, 2));

  const params = {
    p_origin: (filters.origin && filters.origin !== ANY_ORIGIN_VALUE) ? filters.origin : null,
    p_destination: (filters.destination && filters.destination !== ANY_DESTINATION_VALUE) ? filters.destination : null,
    p_search_date_str: (filters.date && filters.date !== "" && filters.date !== undefined) ? filters.date : null,
  };

  console.log('[searchSupabaseTrips] Parameters for RPC call search_trips_with_driver_info:', params);

  try {
    const { data, error } = await supabase.rpc('search_trips_with_driver_info', params);

    if (error) {
      console.error("[searchSupabaseTrips] Error calling RPC search_trips_with_driver_info:", JSON.stringify(error, null, 2));
      throw error;
    }

    console.log('[searchSupabaseTrips] Raw data from RPC:', data ? `${data.length} rows` : 'No data');
    if (data && data.length > 0) {
        console.log('[searchSupabaseTrips] First raw row from RPC:', JSON.stringify(data[0], null, 2));
    }

    if (!data) {
      return [];
    }

    const results: TripSearchResult[] = data.map((trip_from_rpc: any) => {
      const driverName = trip_from_rpc.driver_name || 'Conductor Anónimo';
      let driverAvatar = trip_from_rpc.driver_avatar;

      if (!driverAvatar || (typeof driverAvatar === 'string' && driverAvatar.trim() === '')) {
        const initials = (driverName.substring(0, 2).toUpperCase() || 'CA');
        driverAvatar = `https://placehold.co/100x100.png?text=${encodeURIComponent(initials)}`;
      }

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

export interface RequestTripSeatResult {
  success: boolean;
  message: string;
  alreadyRequested?: boolean;
}

export async function requestTripSeatAction(tripId: string): Promise<RequestTripSeatResult> {
  try {
    console.log('[requestTripSeatAction] Action initiated for tripId:', tripId);
    console.log('[requestTripSeatAction] Attempting to read cookies on server...');
    const cookieStore = cookies();
    const allCookies = cookieStore.getAll();
    console.log('[requestTripSeatAction] All cookies received by server action:', JSON.stringify(allCookies, null, 2));

    const supabaseCookies = allCookies.filter(cookie => cookie.name.startsWith('sb-'));
    if (supabaseCookies.length > 0) {
        console.log('[requestTripSeatAction] Supabase-related cookies found:', JSON.stringify(supabaseCookies, null, 2));
    } else {
        console.warn('[requestTripSeatAction] No Supabase-related cookies found in the request.');
    }

    // Obtener el usuario autenticado directamente en la Server Action
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('[requestTripSeatAction] Error fetching user for request (full error object):', JSON.stringify(authError, null, 2));
      return { success: false, message: "Error de autenticación al obtener usuario: " + authError.message };
    }

    if (!user) {
      console.warn('[requestTripSeatAction] User not authenticated when trying to request seat (getUser returned null).');
      return { success: false, message: "Usuario no autenticado." };
    }
    console.log('[requestTripSeatAction] User successfully retrieved on server:', { id: user.id, email: user.email });
    const passenger_id = user.id;

    // Primero, verificar si el usuario ya ha solicitado este viaje
    const { data: existingRequest, error: selectError } = await supabase
      .from('trip_requests')
      .select('id')
      .eq('trip_id', tripId)
      .eq('passenger_id', passenger_id)
      .maybeSingle();

    if (selectError) {
      console.error('[requestTripSeatAction] Error checking for existing request:', selectError);
      return { success: false, message: "Error al verificar solicitud existente: " + selectError.message };
    }

    if (existingRequest) {
      console.log('[requestTripSeatAction] User has already requested this trip.');
      return { success: true, message: "Ya has solicitado un asiento en este viaje.", alreadyRequested: true };
    }

    // La función RPC search_trips_with_driver_info ya debería filtrar viajes sin cupos.
    // Aquí podríamos añadir una comprobación más explícita si es necesario,
    // pero es mejor que la fuente de verdad (la función RPC) maneje la disponibilidad de asientos.

    const { error: insertError } = await supabase
      .from('trip_requests')
      .insert({ trip_id: tripId, passenger_id: passenger_id, status: 'pending' });

    if (insertError) {
      if (insertError.code === '23505') { // Unique constraint violation
        console.warn('[requestTripSeatAction] Attempted to insert duplicate trip request (caught by DB constraint):', insertError);
        return { success: true, message: "Ya has solicitado un asiento en este viaje.", alreadyRequested: true };
      }
      console.error('[requestTripSeatAction] Error inserting trip request:', insertError);
      return { success: false, message: "Error al solicitar el asiento: " + insertError.message };
    }
    console.log('[requestTripSeatAction] Trip request inserted successfully.');
    return { success: true, message: "¡Asiento solicitado con éxito! El conductor será notificado." };

  } catch (error: any) {
    console.error('[requestTripSeatAction] Catch-all error in requestTripSeatAction:', error);
    return { success: false, message: "Ocurrió un error inesperado: " + error.message };
  }
}
