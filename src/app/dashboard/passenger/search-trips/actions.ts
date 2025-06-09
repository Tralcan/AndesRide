
// src/app/dashboard/passenger/search-trips/actions.ts
'use server';

import { createServerActionClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { cookies } from 'next/headers';

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
  const supabase = createServerActionClient();
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
  alreadyRequested?: boolean; // True if an active (non-cancelled) request exists
}

export async function requestTripSeatAction(tripId: string): Promise<RequestTripSeatResult> {
  const supabase = createServerActionClient();
  console.log('[requestTripSeatAction] Action initiated for tripId:', tripId);

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('[requestTripSeatAction] AuthError fetching user:', JSON.stringify(authError, null, 2));
      return { success: false, message: "Error de autenticación: " + authError.message };
    }
    if (!user) {
      console.warn('[requestTripSeatAction] User not authenticated.');
      return { success: false, message: "Usuario no autenticado." };
    }
    console.log('[requestTripSeatAction] User successfully retrieved:', { id: user.id, email: user.email });
    const passenger_id = user.id;

    // Check for an existing request by this passenger for this trip
    console.log(`[requestTripSeatAction] Checking for existing request for tripId: ${tripId}, passengerId: ${passenger_id}`);
    const { data: existingRequest, error: selectError } = await supabase
      .from('trip_requests')
      .select('id, status') // Also select status
      .eq('trip_id', tripId)
      .eq('passenger_id', passenger_id)
      .maybeSingle(); // Expect 0 or 1

    if (selectError) {
      console.error('[requestTripSeatAction] Error checking for existing request:', JSON.stringify(selectError, null, 2));
      return { success: false, message: "Error al verificar solicitud existente: " + selectError.message };
    }

    if (existingRequest) {
      console.log('[requestTripSeatAction] Found existing request:', JSON.stringify(existingRequest, null, 2));
      if (existingRequest.status === 'cancelled') {
        console.log('[requestTripSeatAction] Existing request is "cancelled". Allowing new request.');
        // Proceed to insert a new request
      } else {
        // If status is 'pending', 'confirmed', or any other non-cancelled status
        console.log(`[requestTripSeatAction] User already has an active request (status: ${existingRequest.status}) for this trip.`);
        return { success: true, message: "Ya has solicitado un asiento en este viaje y tu solicitud está activa.", alreadyRequested: true };
      }
    } else {
      console.log('[requestTripSeatAction] No existing request found. Proceeding to insert new request.');
    }

    // Insert new trip request
    console.log(`[requestTripSeatAction] Attempting to insert new trip request for tripId: ${tripId}, passengerId: ${passenger_id}`);
    const { error: insertError } = await supabase
      .from('trip_requests')
      .insert({ trip_id: tripId, passenger_id: passenger_id, status: 'pending' });

    if (insertError) {
      if (insertError.code === '23505') { // Unique constraint violation
        console.warn('[requestTripSeatAction] Unique constraint violation on insert (likely (trip_id, passenger_id) if not considering status). Error:', JSON.stringify(insertError, null, 2));
        // This case might happen if a previous non-cancelled request exists and our select logic missed it,
        // or if the UNIQUE constraint doesn't account for 'cancelled' status allowing re-requests.
        return { success: false, message: "Error: Parece que ya existe una solicitud activa o hubo un problema de concurrencia. Por favor, recarga e intenta de nuevo." };
      }
      console.error('[requestTripSeatAction] Error inserting trip request:', JSON.stringify(insertError, null, 2));
      return { success: false, message: "Error al solicitar el asiento: " + insertError.message };
    }

    console.log('[requestTripSeatAction] Trip request inserted successfully.');
    return { success: true, message: "¡Asiento solicitado con éxito! El conductor será notificado." };

  } catch (error: any) {
    console.error('[requestTripSeatAction] Catch-all error in requestTripSeatAction:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return { success: false, message: "Ocurrió un error inesperado: " + error.message };
  }
}
    