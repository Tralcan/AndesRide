
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
  requestStatus: 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'cancelled_by_driver' | 'cancelled_trip_modified' | string;
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

  // Fetch all non-rejected requests to show history appropriately
  const { data: requests, error: requestsError } = await supabase
    .from('trip_requests')
    .select(selectString)
    .eq('passenger_id', user.id)
    .not('status', 'eq', 'rejected') // Exclude explicitly rejected by driver unless needed for history
    .order('departure_datetime', { referencedTable: 'trips', ascending: false }); // Show newest trip dates first overall

  if (requestsError) {
    console.error('[MyBookedTripsActions] Error fetching passenger trips:', JSON.stringify(requestsError, null, 2));
    return [];
  }

  if (!requests || requests.length === 0) {
    console.log('[MyBookedTripsActions] No non-rejected requests found for passenger_id:', user.id);
    return [];
  }
  
  console.log(`[MyBookedTripsActions] Found ${requests.length} non-rejected requests for passenger ${user.id}.`);

  const mappedTrips: BookedTrip[] = requests.map(req => {
    const tripData = req.trips as any; 

    if (!tripData) {
      console.warn(`[MyBookedTripsActions] Mapping: Request ID ${req.id} (trip_id: ${req.trip_id}) has no associated tripData.`);
      return null; 
    }
    
    const driverProfileData = tripData.driver_profile as any; 
    let driverInfo: DriverProfile | null = null;

    if (driverProfileData && typeof driverProfileData === 'object') {
      driverInfo = {
        fullName: driverProfileData.full_name || null,
        avatarUrl: driverProfileData.avatar_url || null,
      };
    } else {
      const driverIdShort = tripData.driver_id ? tripData.driver_id.substring(0, 6) : 'N/A';
      const initials = tripData.driver_id ? driverIdShort.substring(0,2).toUpperCase() : 'DR';
      driverInfo = {
        fullName: `Conductor (ID: ${driverIdShort}...)`, 
        avatarUrl: `https://placehold.co/100x100.png?text=${encodeURIComponent(initials)}`,
      };
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

  // Sort client-side to ensure active trips (pending/confirmed future) are first, then historical.
  mappedTrips.sort((a, b) => {
    const aIsActive = (a.requestStatus === 'pending' || a.requestStatus === 'confirmed') && new Date(a.departureDateTime) > new Date();
    const bIsActive = (b.requestStatus === 'pending' || b.requestStatus === 'confirmed') && new Date(b.departureDateTime) > new Date();

    if (aIsActive && !bIsActive) return -1; // a comes first
    if (!aIsActive && bIsActive) return 1;  // b comes first

    // If both are active or both are historical, sort by departure date (most recent first for historical, soonest first for active)
    if (aIsActive) { // Both active, soonest first
        return new Date(a.departureDateTime).getTime() - new Date(b.departureDateTime).getTime();
    } else { // Both historical, most recent departure first
        return new Date(b.departureDateTime).getTime() - new Date(a.departureDateTime).getTime();
    }
  });


  console.log(`[MyBookedTripsActions] Mapped and sorted ${mappedTrips.length} trips.`);
  return mappedTrips;
}

export interface CancelRequestResult {
    success: boolean;
    message: string;
    newStatus?: string | null;
}

// This RPC function 'cancel_passenger_trip_request' MUST handle incrementing 'seats_available'
// on the 'trips' table if the request status was 'confirmed'.
export async function cancelPassengerTripRequestAction(requestId: string): Promise<CancelRequestResult> {
    const supabase = createServerActionClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        console.error('[MyBookedTripsActions] User not authenticated for cancellation.');
        return { success: false, message: 'Usuario no autenticado.' };
    }

    console.log(`[MyBookedTripsActions] User ${user.id} attempting to cancel request ${requestId}`);

    try {
        // It's crucial that this RPC handles seat adjustments if cancelling a 'confirmed' request.
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
            revalidatePath('/dashboard/driver/passenger-requests'); // Driver's view of requests
            revalidatePath('/dashboard/driver/manage-trips'); // Driver's trip list (seats available)
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
