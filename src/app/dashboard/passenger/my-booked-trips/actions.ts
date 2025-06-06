
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
  console.log('[MyBookedTripsActions] Querying trips for passenger_id:', user.id); // <-- CONSOLE.LOG AÑADIDO

  const { data: requests, error: requestsError } = await supabase
    .from('trip_requests')
    .select(\`
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
    \`)
    .eq('passenger_id', user.id)
    .order('requested_at', { ascending: false });

  if (requestsError) {
    console.error('[MyBookedTripsActions] Error fetching passenger booked/requested trips:', requestsError);
    return [];
  }

  if (!requests) {
    return [];
  }

  return requests.map(req => {
    const tripData = req.trips as any; // Cast because Supabase types can be complex here
    const driverProfile = tripData?.profiles as any;

    let driverAvatar = driverProfile?.avatar_url;
    const driverName = driverProfile?.full_name || 'Conductor Anónimo';
    if (!driverAvatar || (typeof driverAvatar === 'string' && driverAvatar.trim() === '')) {
        const initials = (driverName.substring(0, 2).toUpperCase() || 'CA');
        driverAvatar = \`https://placehold.co/100x100.png?text=\${encodeURIComponent(initials)}\`;
    }


    return {
      requestId: req.id,
      tripId: tripData?.id || 'N/A',
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
  }).filter(trip => trip.tripId !== 'N/A'); // Filter out any malformed entries
}

// Future action: Cancel a pending request
// export async function cancelPassengerRequest(requestId: string): Promise<{success: boolean; message: string}> {
//   // Implementation to cancel a request with status 'pending'
//   // Ensure passenger can only cancel their own pending requests.
//   // Check RLS policies for trip_requests update/delete by passenger.
//   return { success: false, message: "Not implemented yet."};
// }
    
