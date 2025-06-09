
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
      profiles ( 
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
    .order('requested_at', { ascending: false });

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
    console.log(`[MyBookedTripsActions] First raw request object:`, JSON.stringify(requests[0], null, 2));
  }


  const mappedTrips: BookedTrip[] = requests.map(req => {
    const tripData = req.trips as any;

    if (!tripData) {
      console.warn(`[MyBookedTripsActions] Request ID ${req.id} (trip_id: ${req.trip_id}) has no associated tripData. RLS on 'trips' might be blocking or data inconsistency.`);
      return null; 
    }
    
    const driverProfileData = tripData.profiles as any; 
    let driverInfo: DriverProfile | null = null;

    if (driverProfileData) {
      driverInfo = {
        fullName: driverProfileData.full_name,
        avatarUrl: driverProfileData.avatar_url,
      };
    } else {
      const driverIdShort = tripData.driver_id ? tripData.driver_id.substring(0, 6) : 'N/A';
      const initials = tripData.driver_id ? driverIdShort.substring(0,2).toUpperCase() : 'DR';
      driverInfo = {
        fullName: `Conductor (ID: ${driverIdShort}...)`, // Fallback name
        avatarUrl: `https://placehold.co/100x100.png?text=${encodeURIComponent(initials)}`, // Fallback avatar
      };
      console.warn(`[MyBookedTripsActions] Profile data (tripData.profiles) not found for driver_id ${tripData.driver_id} on trip ${tripData.id}. Using fallback driver info.`);
    }
    
    console.log(`[MyBookedTripsActions] Processing tripData for request ${req.id}:`, JSON.stringify(tripData, null, 2));
    console.log(`[MyBookedTripsActions] Driver profile data for request ${req.id}:`, JSON.stringify(driverProfileData, null, 2));
    console.log(`[MyBookedTripsActions] Resulting driverInfo for request ${req.id}:`, JSON.stringify(driverInfo, null, 2));


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

  console.log(`[MyBookedTripsActions] Mapped ${mappedTrips.length} trips. First mapped trip (if any):`, mappedTrips.length > 0 ? JSON.stringify(mappedTrips[0], null, 2) : "N/A");
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
        return { success: false, message: 'Usuario no autenticado.' };
    }

    console.log(`[MyBookedTripsActions] User ${user.id} attempting to cancel request ${requestId}`);

    try {
        // Llamada a la función RPC en Supabase
        const { data, error } = await supabase.rpc('cancel_passenger_trip_request', {
            p_request_id: requestId
        });

        if (error) {
            console.error('[MyBookedTripsActions] RPC error cancelling request:', JSON.stringify(error, null, 2));
            return { success: false, message: `Error al cancelar la solicitud: ${error.message}` };
        }

        // La función RPC devuelve una tabla con una fila: {success: boolean, message: text, new_status: text}
        const result = data && data.length > 0 ? data[0] : null;

        if (result && result.success) {
            console.log(`[MyBookedTripsActions] Request ${requestId} cancelled successfully. New status: ${result.new_status}`);
            revalidatePath('/dashboard/passenger/my-booked-trips');
            return { success: true, message: result.message, newStatus: result.new_status };
        } else {
            console.warn(`[MyBookedTripsActions] RPC call to cancel request ${requestId} did not succeed or returned unexpected data. Result:`, result);
            return { success: false, message: result?.message || 'No se pudo cancelar la solicitud.', newStatus: result?.new_status };
        }
    } catch (e: any) {
        console.error('[MyBookedTripsActions] Exception cancelling request:', e);
        return { success: false, message: `Excepción: ${e.message}` };
    }
}
