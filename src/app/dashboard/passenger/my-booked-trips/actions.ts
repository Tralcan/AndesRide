
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
  driver: DriverProfile | null; // Temporarily, this might contain placeholder data
  requestStatus: 'pending' | 'confirmed' | 'rejected' | string;
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

  // SIMPLIFIED SELECT STRING: Temporarily remove profiles join
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
      driver_id 
    )
  `;

  console.log('[MyBookedTripsActions] USING SIMPLIFIED selectString (no driver profiles):', selectString);

  const { data: requests, error: requestsError } = await supabase
    .from('trip_requests')
    .select(selectString)
    .eq('passenger_id', user.id)
    .order('requested_at', { ascending: false });

  if (requestsError) {
    // Este log es crucial si hay un error en la consulta
    console.error('[MyBookedTripsActions] Error fetching passenger booked/requested trips (SIMPLIFIED QUERY):', JSON.stringify(requestsError, null, 2));
    return [];
  }

  if (!requests || requests.length === 0) {
    console.log('[MyBookedTripsActions] No requests found for passenger_id (SIMPLIFIED QUERY):', user.id);
    return [];
  }

  console.log(`[MyBookedTripsActions] Found ${requests.length} requests for passenger ${user.id} (SIMPLIFIED QUERY). Logging first 2 raw requests (if any):`);
  requests.slice(0, 2).forEach((req, index) => {
    console.log(`[MyBookedTripsActions] Raw request ${index + 1} (SIMPLIFIED QUERY):`, JSON.stringify(req, null, 2));
  });

  const mappedTrips: BookedTrip[] = requests.map(req => {
    const tripData = req.trips as any; // tripData should now contain basic trip info

    if (!tripData) {
      console.warn(`[MyBookedTripsActions] Request ID ${req.id} (trip_id: ${req.trip_id}) has no associated tripData (req.trips is null/undefined). Check RLS on 'trips'. (SIMPLIFIED QUERY)`);
      return null;
    }
    
    console.log(`[MyBookedTripsActions] Processing tripData for request ${req.id}:`, JSON.stringify(tripData, null, 2));

    // Placeholder for driver info since we removed the join to profiles
    const driverFullNamePlaceholder = tripData.driver_id ? `Conductor (ID: ${tripData.driver_id.substring(0,8)}...)` : 'Conductor no disponible';
    const driverAvatarPlaceholder = `https://placehold.co/40x40.png?text=${tripData.driver_id ? tripData.driver_id.substring(0,2).toUpperCase() : 'CA'}`;

    return {
      requestId: req.id,
      tripId: tripData.id,
      origin: tripData.origin,
      destination: tripData.destination,
      departureDateTime: tripData.departure_datetime,
      driver: { // Using placeholder driver info
        fullName: driverFullNamePlaceholder,
        avatarUrl: driverAvatarPlaceholder,
      },
      requestStatus: req.status,
      requestedAt: req.requested_at,
      seatsAvailableOnTrip: tripData.seats_available ?? 0,
    };
  }).filter(trip => trip !== null) as BookedTrip[];

  console.log(`[MyBookedTripsActions] Mapped ${mappedTrips.length} trips after processing (SIMPLIFIED QUERY). First mapped trip (if any):`, mappedTrips.length > 0 ? JSON.stringify(mappedTrips[0], null, 2) : "N/A");
  
  return mappedTrips;
}
