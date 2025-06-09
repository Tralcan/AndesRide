
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

  // Simplificamos la consulta: NO intentamos traer el perfil del conductor anidado aquí.
  // Solo traemos driver_id desde trips.
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

  const { data: requests, error: requestsError } = await supabase
    .from('trip_requests')
    .select(selectString)
    .eq('passenger_id', user.id)
    .in('status', ['pending', 'confirmed']) // Solo mostrar pendientes o confirmadas
    .order('requested_at', { ascending: false });

  if (requestsError) {
    console.error('[MyBookedTripsActions] Error fetching passenger booked/requested trips:', JSON.stringify(requestsError, null, 2));
    return [];
  }

  if (!requests || requests.length === 0) {
    console.log('[MyBookedTripsActions] No "pending" or "confirmed" requests found for passenger_id:', user.id);
    return [];
  }

  console.log(`[MyBookedTripsActions] Found ${requests.length} "pending" or "confirmed" requests for passenger ${user.id}. Logging first raw request (if any):`);
  if (requests.length > 0) {
    console.log(`[MyBookedTripsActions] Raw request 1:`, JSON.stringify(requests[0], null, 2));
  }


  const mappedTrips: BookedTrip[] = requests.map(req => {
    const tripData = req.trips as any;

    if (!tripData) {
      console.warn(`[MyBookedTripsActions] Request ID ${req.id} (trip_id: ${req.trip_id}) has no associated tripData (req.trips is null/undefined). RLS on 'trips' might be blocking.`);
      return null;
    }
    
    console.log(`[MyBookedTripsActions] Processing tripData for request ${req.id}:`, JSON.stringify(tripData, null, 2));

    // Creamos un DriverProfile placeholder ya que no estamos fetcheando los datos del conductor
    const driverName = tripData.driver_id ? `Conductor (ID: ${tripData.driver_id.substring(0,6)}...)` : 'Conductor Anónimo';
    const initials = (driverName.substring(0, 2).toUpperCase() || 'CA');
    const driverAvatar = `https://placehold.co/100x100.png?text=${encodeURIComponent(initials)}`;

    return {
      requestId: req.id,
      tripId: tripData.id,
      origin: tripData.origin,
      destination: tripData.destination,
      departureDateTime: tripData.departure_datetime,
      driver: { // Placeholder driver info
        fullName: driverName,
        avatarUrl: driverAvatar,
      },
      requestStatus: req.status,
      requestedAt: req.requested_at,
      seatsAvailableOnTrip: tripData.seats_available ?? 0,
    };
  }).filter(trip => trip !== null) as BookedTrip[];

  console.log(`[MyBookedTripsActions] Mapped ${mappedTrips.length} trips after processing. First mapped trip (if any):`, mappedTrips.length > 0 ? JSON.stringify(mappedTrips[0], null, 2) : "N/A");
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
        // Llamar a la función de PostgreSQL
        const { data, error } = await supabase.rpc('cancel_passenger_trip_request', {
            p_request_id: requestId
        });

        if (error) {
            console.error('[MyBookedTripsActions] RPC error cancelling request:', JSON.stringify(error, null, 2));
            return { success: false, message: `Error al cancelar la solicitud: ${error.message}` };
        }

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

