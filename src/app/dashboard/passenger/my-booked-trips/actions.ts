
// src/app/dashboard/passenger/my-booked-trips/actions.ts
'use server';

import { createServerActionClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface DriverProfile {
  fullName: string | null;
  avatarUrl: string | null;
}

export interface BookedTrip {
  requestId: string; // ID of the trip_request
  tripId: string;
  origin: string;
  destination: string;
  departureDateTime: string; // ISO string
  driver: DriverProfile | null;
  requestStatus: 'pending' | 'confirmed' | 'rejected' | 'cancelled' | string;
  requestedAt: string; // ISO string
  seatsAvailableOnTrip: number;
}

export async function getPassengerBookedTrips(): Promise<BookedTrip[]> {
  const supabase = createServerActionClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('[MyBookedTripsActions] User not authenticated:', authError?.message);
    return [];
  }
  console.log('[MyBookedTripsActions] Querying trips for passenger_id:', user.id);

  const selectString = `
    id,
    status,
    requested_at,
    trip_id,
    trips (
      id,
      origin,
      destination,
      departure_datetime,
      seats_available,
      driver_id,
      driver_profile:profiles ( 
        full_name,
        avatar_url
      )
    )
  `;

  const { data: requests, error: requestsError } = await supabase
    .from('trip_requests')
    .select(selectString)
    .eq('passenger_id', user.id)
    .in('status', ['pending', 'confirmed'])
    // Order by the departure_datetime of the referenced trip in ascending order (earliest first)
    .order('departure_datetime', { referencedTable: 'trips', ascending: true });

  if (requestsError) {
    console.error('[MyBookedTripsActions] Error fetching passenger booked/requested trips:', JSON.stringify(requestsError, null, 2));
    return [];
  }

  if (!requests || requests.length === 0) {
    console.log('[MyBookedTripsActions] No "pending" or "confirmed" requests found for passenger_id:', user.id);
    return [];
  }
  
  console.log(`[MyBookedTripsActions] Found ${requests.length} "pending" or "confirmed" requests for passenger ${user.id}.`);
  if (requests.length > 0) {
    console.log(`[MyBookedTripsActions] First raw request object (with nested trip and profile) BEFORE MAPPING:`, JSON.stringify(requests[0], null, 2));
  }

  const mappedTrips: BookedTrip[] = requests.map(req => {
    const tripData = req.trips as any; 

    if (!tripData) {
      console.warn(`[MyBookedTripsActions] Mapping: Request ID ${req.id} (trip_id: ${req.trip_id}) has no associated tripData.`);
      return null; 
    }
    
    console.log(`[MyBookedTripsActions] Mapping: Processing tripData for request ${req.id}:`, JSON.stringify(tripData, null, 2));
    
    const driverProfileData = tripData.driver_profile as any; 
    let driverInfo: DriverProfile | null = null;

    console.log(`[MyBookedTripsActions] Mapping: Raw driver_profile data for trip ${tripData.id}:`, JSON.stringify(driverProfileData, null, 2));

    if (driverProfileData && typeof driverProfileData === 'object') {
      driverInfo = {
        fullName: driverProfileData.full_name || null, // Ensure null if undefined/empty
        avatarUrl: driverProfileData.avatar_url || null, // Ensure null if undefined/empty
      };
      console.log(`[MyBookedTripsActions] Mapping: driverInfo CREATED for trip ${tripData.id}:`, JSON.stringify(driverInfo, null, 2));
    } else {
      const driverIdShort = tripData.driver_id ? tripData.driver_id.substring(0, 6) : 'N/A';
      const initials = tripData.driver_id ? driverIdShort.substring(0,2).toUpperCase() : 'DR';
      driverInfo = {
        fullName: `Conductor (ID: ${driverIdShort}...)`, 
        avatarUrl: `https://placehold.co/100x100.png?text=${encodeURIComponent(initials)}`,
      };
      console.warn(`[MyBookedTripsActions] Mapping: Profile data (tripData.driver_profile) not found or not an object for driver_id ${tripData.driver_id} on trip ${tripData.id}. Using FALLBACK driver info. Raw driver_profile:`, JSON.stringify(driverProfileData, null, 2));
      console.log(`[MyBookedTripsActions] Mapping: driverInfo FALLBACK for trip ${tripData.id}:`, JSON.stringify(driverInfo, null, 2));
    }
    
    return {
      requestId: req.id,
      tripId: tripData.id,
      origin: tripData.origin,
      destination: tripData.destination,
      departureDateTime: tripData.departure_datetime,
      driver: driverInfo,
      requestStatus: req.status,
      requestedAt: req.requested_at,
      seatsAvailableOnTrip: tripData.seats_available ?? 0,
    };
  }).filter(trip => trip !== null) as BookedTrip[]; 

  console.log(`[MyBookedTripsActions] Mapped ${mappedTrips.length} trips.`);
  if (mappedTrips.length > 0) {
    console.log(`[MyBookedTripsActions] First MAPPED trip object sent to client:`, JSON.stringify(mappedTrips[0], null, 2));
  }
  return mappedTrips;
}

export interface CancelRequestResult {
    success: boolean;
    message: string;
    newStatus?: string | null;
}

export async function cancelPassengerTripRequestAction(requestId: string): Promise<CancelRequestResult> {
    const supabase = createServerActionClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        console.error('[MyBookedTripsActions] User not authenticated for cancellation.');
        return { success: false, message: 'Usuario no autenticado.' };
    }

    console.log(`[MyBookedTripsActions] User ${user.id} attempting to cancel request ${requestId}`);

    try {
        const { data, error } = await supabase.rpc('cancel_passenger_trip_request', {
            p_request_id: requestId
        });

        if (error) {
            console.error('[MyBookedTripsActions] RPC error cancelling request:', JSON.stringify(error, null, 2));
            return { success: false, message: `Error al cancelar la solicitud: ${error.message}` };
        }

        const result = data && Array.isArray(data) && data.length > 0 ? data[0] : data;

        if (result && result.success) {
            console.log(`[MyBookedTripsActions] Request ${requestId} cancelled successfully via RPC. New status: ${result.new_status}`);
            revalidatePath('/dashboard/passenger/my-booked-trips'); 
            return { success: true, message: result.message, newStatus: result.new_status };
        } else {
            console.warn(`[MyBookedTripsActions] RPC call to cancel request ${requestId} did not succeed or returned unexpected data. Result:`, result);
            return { success: false, message: result?.message || 'No se pudo cancelar la solicitud desde la RPC.', newStatus: result?.new_status };
        }
    } catch (e: any) {
        console.error('[MyBookedTripsActions] Exception cancelling request:', e);
        return { success: false, message: `Excepción al cancelar solicitud: ${e.message}` };
    }
}
    
