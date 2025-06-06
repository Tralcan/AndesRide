
// src/app/dashboard/passenger/my-booked-trips/actions.ts
'use server';

import { createServerActionClient } from '@/lib/supabase/server';

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
  requestStatus: 'pending' | 'confirmed' | 'rejected' | string; // string for safety if other statuses exist
  requestedAt: string; // ISO string
  seatsAvailableOnTrip: number; // To know if the original trip still has general availability
}

export async function getPassengerBookedTrips(): Promise<BookedTrip[]> {
  const supabase = createServerActionClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('[MyBookedTripsActions] User not authenticated:', authError?.message);
    return [];
  }
  console.log('[MyBookedTripsActions] Querying trips for passenger_id:', user.id);

  const selectString =
    'id, status, requested_at, trip_id, ' +
    'trips(id, origin, destination, departure_datetime, seats_available, driver_id, ' +
    'profiles(full_name, avatar_url))';

  const { data: requests, error: requestsError } = await supabase
    .from('trip_requests')
    .select(selectString)
    .eq('passenger_id', user.id)
    .order('requested_at', { ascending: false });

  if (requestsError) {
    console.error('[MyBookedTripsActions] Error fetching passenger booked/requested trips:', requestsError);
    console.error('[MyBookedTripsActions] Supabase error object:', JSON.stringify(requestsError, null, 2));
    return [];
  }

  if (!requests) {
    console.log('[MyBookedTripsActions] No requests data structure returned from Supabase (requests is null/undefined).');
    return [];
  }

  console.log('[MyBookedTripsActions] Raw requests from Supabase for passenger_id', user.id, ':', JSON.stringify(requests, null, 2));

  if (requests.length === 0) {
    console.log('[MyBookedTripsActions] Zero requests found in Supabase query result for this passenger.');
    return [];
  }

  const mappedTrips = requests.map(req => {
    console.log(`[MyBookedTripsActions] Processing request ID: ${req.id}, status: ${req.status}`);
    const tripData = req.trips as any; // Cast because Supabase types can be complex here
    const driverProfile = tripData?.profiles as any;

    console.log(`[MyBookedTripsActions]   Raw associated tripData for request ${req.id}:`, JSON.stringify(tripData, null, 2));
    console.log(`[MyBookedTripsActions]   Raw associated driverProfile for request ${req.id}:`, JSON.stringify(driverProfile, null, 2));

    let driverAvatar = driverProfile?.avatar_url;
    const driverName = driverProfile?.full_name || 'Conductor Anónimo';
    if (!driverAvatar || (typeof driverAvatar === 'string' && driverAvatar.trim() === '')) {
        const initials = (driverName.substring(0, 2).toUpperCase() || 'CA');
        driverAvatar = `https://placehold.co/100x100.png?text=${encodeURIComponent(initials)}`;
    }

    const bookedTrip: BookedTrip = {
      requestId: req.id,
      tripId: tripData?.id || 'N/A_TRIP_ID_MISSING', // Make it more obvious if tripId is missing
      origin: tripData?.origin || 'N/A',
      destination: tripData?.destination || 'N/A',
      departureDateTime: tripData?.departure_datetime || new Date(0).toISOString(),
      driver: tripData ? {
        fullName: driverName,
        avatarUrl: driverAvatar,
      } : null,
      requestStatus: req.status,
      requestedAt: req.requested_at,
      seatsAvailableOnTrip: tripData?.seats_available ?? 0,
    };
    console.log(`[MyBookedTripsActions]   Mapped BookedTrip object for request ${req.id}:`, JSON.stringify(bookedTrip, null, 2));
    return bookedTrip;
  });

  const filteredTrips = mappedTrips.filter(trip => trip.tripId !== 'N/A_TRIP_ID_MISSING');
  console.log(`[MyBookedTripsActions] Total mapped trips before filter: ${mappedTrips.length}, After filter (valid tripId): ${filteredTrips.length}`);

  if (filteredTrips.length !== mappedTrips.length) {
    console.warn(`[MyBookedTripsActions] Some trips were filtered out due to missing tripId. Initial count: ${mappedTrips.length}, Final count: ${filteredTrips.length}`);
    // Log which ones were filtered
    mappedTrips.forEach(mt => {
        if (mt.tripId === 'N/A_TRIP_ID_MISSING') {
            console.warn(`[MyBookedTripsActions]   Trip filtered out: RequestID ${mt.requestId} had missing tripId. Original req.trips:`, requests.find(r => r.id === mt.requestId)?.trips);
        }
    });
  }
  
  return filteredTrips;
}

// Future action: Cancel a pending request
// export async function cancelPassengerRequest(requestId: string): Promise<{success: boolean; message: string}> {
//   // Implementation to cancel a request with status 'pending'
//   // Ensure passenger can only cancel their own pending requests.
//   // Check RLS policies for trip_requests update/delete by passenger.
//   return { success: false, message: "Not implemented yet."};
// }
    
