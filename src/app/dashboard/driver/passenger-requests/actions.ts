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
  status: 'pending' | 'confirmed' | 'rejected';
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
        created_at,
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

  return driverTrips.map(trip => ({
    tripId: trip.id,
    origin: trip.origin,
    destination: trip.destination,
    departureDateTime: trip.departure_datetime,
    seatsAvailable: trip.seats_available,
    requests: (trip.trip_requests as any[] || []).map(req => ({
      id: req.id,
      status: req.status,
      requestedAt: req.created_at,
      // Supabase nests the related record inside a key with the table name ('profiles')
      // or the explicit relation name if defined.
      passenger: req.profiles ? {
        id: req.profiles.id,
        fullName: req.profiles.full_name,
        avatarUrl: req.profiles.avatar_url,
      } : null,
    })).filter(r => r.status === 'pending' || r.status === 'confirmed'), // Show pending and confirmed
  }));
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

  // Verify the current user is the driver of the trip associated with this request
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
  
  // If confirming, check seats. This is a simplified check.
  // A robust solution would use an RPC for atomic decrement.
  if (newStatus === 'confirmed' && requestDetails.status === 'pending') {
    if (requestDetails.trips.seats_available <= 0) {
      return { success: false, message: 'No hay asientos disponibles en este viaje para confirmar la solicitud.' };
    }
    // Decrement seats (non-atomically, for now)
    const { error: seatUpdateError } = await supabase
        .from('trips')
        .update({ seats_available: requestDetails.trips.seats_available - 1 })
        .eq('id', requestDetails.trip_id);

    if (seatUpdateError) {
        console.error('[PassengerRequestsActions] Error decrementing seats:', seatUpdateError);
        return { success: false, message: 'Error al actualizar los asientos disponibles. No se confirmó la solicitud.' };
    }
  }


  const { error: updateError } = await supabase
    .from('trip_requests')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', requestId);

  if (updateError) {
    console.error('[PassengerRequestsActions] Error updating trip request status:', updateError);
    // If seat decrement happened but status update failed, we have an inconsistency.
    // This is why an RPC is preferred for atomicity.
    // For now, we'll just report the status update error.
    return { success: false, message: `Error al actualizar el estado de la solicitud: ${updateError.message}` };
  }

  revalidatePath('/dashboard/driver/passenger-requests');
  return { success: true, message: `Solicitud ${newStatus === 'confirmed' ? 'confirmada' : 'rechazada'} con éxito.` };
}
