
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

  // La estructura de selección anidada es crucial.
  // trips(...) y profiles(...) deben tener los campos correctos.
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
    .order('requested_at', { ascending: false });

  if (requestsError) {
    console.error('[MyBookedTripsActions] Error fetching passenger booked/requested trips:', JSON.stringify(requestsError, null, 2));
    return [];
  }

  if (!requests || requests.length === 0) {
    console.log('[MyBookedTripsActions] No requests found for passenger_id:', user.id);
    return [];
  }

  console.log(`[MyBookedTripsActions] Found ${requests.length} requests for passenger ${user.id}. Raw data:`, JSON.stringify(requests.slice(0, 2), null, 2)); // Log solo las primeras 2 para brevedad

  const mappedTrips: BookedTrip[] = requests.map(req => {
    // req.trips es el objeto anidado de la tabla 'trips'
    // req.trips.profiles es el objeto anidado de la tabla 'profiles' a través de 'trips'
    const tripData = req.trips as any; // Cast si la inferencia de tipos de Supabase no es perfecta aquí
    
    if (!tripData) {
      console.warn(`[MyBookedTripsActions] Request ID ${req.id} has no associated tripData (req.trips is null/undefined). This might be due to RLS on 'trips' table or a broken relation.`);
      return null; // Omitir este viaje si no hay datos del viaje
    }

    const driverProfileData = tripData.profiles as any; // Cast similar

    if (!driverProfileData && tripData.driver_id) {
      console.warn(`[MyBookedTripsActions] Trip ID ${tripData.id} (Request ID ${req.id}) has a driver_id (${tripData.driver_id}) but no associated driverProfileData (tripData.profiles is null/undefined). This might be due to RLS on 'profiles' table.`);
    }
    
    const driverName = driverProfileData?.full_name || 'Conductor Anónimo';
    let driverAvatar = driverProfileData?.avatar_url;

    if (!driverAvatar || (typeof driverAvatar === 'string' && driverAvatar.trim() === '')) {
        const initials = (driverName.substring(0, 2).toUpperCase() || 'CA');
        driverAvatar = `https://placehold.co/100x100.png?text=${encodeURIComponent(initials)}`;
    }

    return {
      requestId: req.id,
      tripId: tripData.id,
      origin: tripData.origin,
      destination: tripData.destination,
      departureDateTime: tripData.departure_datetime,
      driver: {
        fullName: driverName,
        avatarUrl: driverAvatar,
      },
      requestStatus: req.status,
      requestedAt: req.requested_at,
      seatsAvailableOnTrip: tripData.seats_available ?? 0,
    };
  }).filter(trip => trip !== null) as BookedTrip[]; // Filtrar los nulos si tripData no existía

  console.log(`[MyBookedTripsActions] Mapped ${mappedTrips.length} trips after processing and filtering. First mapped trip (if any):`, mappedTrips.length > 0 ? JSON.stringify(mappedTrips[0], null, 2) : "N/A");
  
  return mappedTrips;
}

// Future action: Cancel a pending request
// export async function cancelPassengerRequest(requestId: string): Promise<{success: boolean; message: string}> {
//   // Implementation to cancel a request with status 'pending'
//   // Ensure passenger can only cancel their own pending requests.
//   // Check RLS policies for trip_requests update/delete by passenger.
//   return { success: false, message: "Not implemented yet."};
// }
    
