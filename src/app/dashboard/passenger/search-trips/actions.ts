
// src/app/dashboard/passenger/search-trips/actions.ts
'use server';

import { createServerActionClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache'; // Added revalidatePath

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
  alreadyRequested?: boolean; 
}

export async function requestTripSeatAction(tripId: string): Promise<RequestTripSeatResult> {
  const supabase = createServerActionClient();
  console.log(`[requestTripSeatAction] Action initiated for tripId: ${tripId}`);

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      const errorMsg = authError ? authError.message : "User object is null.";
      console.error(`[requestTripSeatAction] AuthError or no user: ${errorMsg}`);
      return { success: false, message: `Error de autenticación: ${errorMsg}` };
    }
    const passenger_id = user.id;
    console.log(`[requestTripSeatAction] User successfully retrieved on server: { id: ${passenger_id}, email: ${user.email} }`);

    // 1. Check for an EXISTING ACTIVE request ('pending' or 'confirmed')
    console.log(`[requestTripSeatAction] Checking for existing ACTIVE request for tripId: ${tripId}, passengerId: ${passenger_id}`);
    const { data: existingActiveRequest, error: selectActiveError } = await supabase
      .from('trip_requests')
      .select('id, status')
      .eq('trip_id', tripId)
      .eq('passenger_id', passenger_id)
      .in('status', ['pending', 'confirmed']) // Only check for currently active requests
      .maybeSingle();

    if (selectActiveError) {
      console.error(`[requestTripSeatAction] Error checking for existing ACTIVE request: ${JSON.stringify(selectActiveError, null, 2)}`);
      return { success: false, message: `Error al verificar solicitud activa existente: ${selectActiveError.message}` };
    }

    if (existingActiveRequest) {
      // User already has a pending or confirmed request for this trip.
      console.log(`[requestTripSeatAction] Found existing ACTIVE request: id=${existingActiveRequest.id}, status=${existingActiveRequest.status}`);
      return { 
        success: true, 
        message: `Ya tienes una solicitud ${existingActiveRequest.status === 'pending' ? 'pendiente' : 'confirmada'} para este viaje.`, 
        alreadyRequested: true 
      };
    }

    // 2. No active request found. Proceed to INSERT a new request.
    // Any previous requests with statuses like 'cancelled', 'rejected', 'cancelled_trip_modified' are just history.
    console.log(`[requestTripSeatAction] No existing ACTIVE request found. Attempting to INSERT new request for tripId: ${tripId}, passengerId: ${passenger_id}.`);
    const { error: insertError } = await supabase
      .from('trip_requests')
      .insert({ 
        trip_id: tripId, 
        passenger_id: passenger_id, 
        status: 'pending', 
        requested_at: new Date().toISOString() 
      });

    if (insertError) {
      console.error(`[requestTripSeatAction] Error INSERTING new trip request: ${JSON.stringify(insertError, null, 2)}`);
      if (insertError.code === '23505') { 
           console.warn('[requestTripSeatAction] Unique constraint violation on insert. This might indicate a race condition or flaw in active request check.');
           return { success: false, message: "Error: Ya existe una solicitud activa o hubo un problema de concurrencia. Refresca e intenta de nuevo." };
      }
      return { success: false, message: `Error al solicitar el asiento: ${insertError.message}` };
    }
    
    console.log(`[requestTripSeatAction] Successfully INSERTED new trip request for tripId: ${tripId}, passengerId: ${passenger_id}.`);
    
    // Revalidate paths so UIs update
    revalidatePath('/dashboard/passenger/my-booked-trips'); // Passenger's list of their requests
    revalidatePath('/dashboard/driver/passenger-requests'); // Driver's list of requests for their trips
    // revalidatePath('/dashboard/passenger/search-trips'); // Revalidating search trips might not be necessary unless UI changes based on request state.
                                                          // For now, assume availableSeats on TripCard is sufficient.
    
    return { success: true, message: "¡Asiento solicitado con éxito! El conductor será notificado." };

  } catch (error: any) {
    console.error(`[requestTripSeatAction] Catch-all error: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
    return { success: false, message: `Ocurrió un error inesperado: ${error.message}` };
  }
}
    
