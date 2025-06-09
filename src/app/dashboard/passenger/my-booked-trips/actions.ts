
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

  // Solicitamos los perfiles del conductor directamente a través de la FK driver_id en trips
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

  console.log(`[MyBookedTripsActions] Found ${requests.length} "pending" or "confirmed" requests for passenger ${user.id}.`);
  
  const mappedTrips: BookedTrip[] = requests.map(req => {
    const tripData = req.trips as any;

    if (!tripData) {
      console.warn(`[MyBookedTripsActions] Request ID ${req.id} (trip_id: ${req.trip_id}) has no associated tripData. RLS on 'trips' might be blocking.`);
      return null;
    }
    
    // Los datos del perfil del conductor ahora vienen de tripData.driver_profile
    const driverProfileData = tripData.driver_profile as any;
    const driverName = driverProfileData?.full_name || (tripData.driver_id ? `Conductor (ID: ${tripData.driver_id.substring(0,6)}...)` : 'Conductor Anónimo');
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
  }).filter(trip => trip !== null) as BookedTrip[];

  console.log(`[MyBookedTripsActions] Mapped ${mappedTrips.length} trips after processing.`);
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

        // La función RPC devuelve un array con un objeto, así que tomamos el primero.
        const result = data && data.length > 0 ? data[0] : null;

        if (result && result.success) {
            console.log(`[MyBookedTripsActions] Request ${requestId} cancelled successfully. New status: ${result.new_status}`);
            revalidatePath('/dashboard/passenger/my-booked-trips'); // Revalidar la página para refrescar la lista
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
