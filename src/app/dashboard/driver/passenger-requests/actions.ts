
// src/app/dashboard/driver/passenger-requests/actions.ts
'use server';

import { createServerActionClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface PassengerRequestProfile {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface PassengerRequest {
  id: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'cancelled_by_driver' | 'cancelled_trip_modified';
  requestedAt: string; // ISO string
  passenger: PassengerRequestProfile | null;
}

export interface TripWithPassengerRequests {
  tripId: string;
  origin: string;
  destination: string;
  departureDateTime: string; // ISO string
  seatsAvailable: number;
  requests: PassengerRequest[];
}

export async function getDriverTripsWithRequests(): Promise<TripWithPassengerRequests[]> {
  const supabase = createServerActionClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.error('[PassengerRequestsActions] User not authenticated.');
    return [];
  }

  const { data: driverTrips, error: tripsError } = await supabase
    .from('trips')
    .select(`
      id,
      origin,
      destination,
      departure_datetime,
      seats_available,
      trip_requests (
        id,
        status,
        requested_at, 
        passenger_id,
        profiles (
          id,
          full_name,
          avatar_url
        )
      )
    `)
    .eq('driver_id', user.id)
    .gt('departure_datetime', new Date().toISOString()) // Only future trips
    .order('departure_datetime', { ascending: true });

  if (tripsError) {
    console.error('[PassengerRequestsActions] Error fetching driver trips with requests:', tripsError);
    return [];
  }

  if (!driverTrips) {
    return [];
  }

  return driverTrips.map(trip => {
    // console.log(`[PassengerRequestsActions] Raw trip_requests for trip ${trip.id}:`, JSON.stringify(trip.trip_requests, null, 2));
    
    const mappedRequests = (trip.trip_requests as any[] || []).map(req => ({
      id: req.id,
      status: req.status,
      requestedAt: req.requested_at,
      passenger: req.profiles ? {
        id: req.profiles.id,
        fullName: req.profiles.full_name,
        avatarUrl: req.profiles.avatar_url,
      } : null,
    }));

    // console.log(`[PassengerRequestsActions] Mapped requests for trip ${trip.id} (before client-side filtering):`, JSON.stringify(mappedRequests, null, 2));

    return {
      tripId: trip.id,
      origin: trip.origin,
      destination: trip.destination,
      departureDateTime: trip.departure_datetime,
      seatsAvailable: trip.seats_available,
      requests: mappedRequests,
    };
  });
}

export async function updateTripRequestStatus(
  requestId: string,
  newStatus: 'confirmed' | 'rejected'
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerActionClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, message: 'Error de autenticación.' };
  }

  const { data: requestDetails, error: requestDetailsError } = await supabase
    .from('trip_requests')
    .select(`
      id,
      status,
      trip_id,
      trips (
        driver_id,
        seats_available
      )
    `)
    .eq('id', requestId)
    .single();

  if (requestDetailsError || !requestDetails) {
    console.error('[PassengerRequestsActions] Error fetching request details:', requestDetailsError);
    return { success: false, message: 'No se pudo obtener la solicitud.' };
  }

  if (!requestDetails.trips || requestDetails.trips.driver_id !== user.id) {
    return { success: false, message: 'No autorizado para modificar esta solicitud.' };
  }
  
  // Handle seat adjustments
  if (newStatus === 'confirmed' && requestDetails.status === 'pending') {
    if (requestDetails.trips.seats_available <= 0) {
      return { success: false, message: 'No hay asientos disponibles en este viaje para confirmar la solicitud.' };
    }
    const { error: seatUpdateError } = await supabase
        .from('trips')
        .update({ seats_available: requestDetails.trips.seats_available - 1 })
        .eq('id', requestDetails.trip_id);

    if (seatUpdateError) {
        console.error('[PassengerRequestsActions] Error decrementing seats:', seatUpdateError);
        return { success: false, message: 'Error al actualizar los asientos disponibles. No se confirmó la solicitud.' };
    }
  } else if (newStatus === 'rejected' && requestDetails.status === 'confirmed') {
    // Increment seats if a confirmed request is rejected by the driver
    const { error: seatUpdateError } = await supabase
        .from('trips')
        .update({ seats_available: requestDetails.trips.seats_available + 1 })
        .eq('id', requestDetails.trip_id);
    if (seatUpdateError) {
        console.error('[PassengerRequestsActions] Error incrementing seats on rejection:', seatUpdateError);
        // Log error, but allow status update to proceed for now
    }
  }

  const { error: updateError } = await supabase
    .from('trip_requests')
    .update({ status: newStatus, updated_at: new Date().toISOString() }) 
    .eq('id', requestId);

  if (updateError) {
    console.error('[PassengerRequestsActions] Error updating trip request status:', updateError);
    return { success: false, message: `Error al actualizar el estado de la solicitud: ${updateError.message}` };
  }

  revalidatePath('/dashboard/driver/passenger-requests');
  revalidatePath('/dashboard/driver/manage-trips'); // Seats available might change
  revalidatePath(`/dashboard/passenger/my-booked-trips`); // Passenger's view might change
  return { success: true, message: `Solicitud ${newStatus === 'confirmed' ? 'confirmada' : 'rechazada'} con éxito.` };
}
