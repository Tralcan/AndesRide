
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

  // Con la Foreign Key trips.driver_id -> profiles.id correctamente definida,
  // PostgREST debería poder inferir la relación para anidar 'profiles'.
  // Usamos un alias 'driver_profile' para la tabla anidada 'profiles'.
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
    .in('status', ['pending', 'confirmed']) // Solo mostrar solicitudes activas o pendientes de confirmación
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
    // Loguear solo el primer objeto request para no inundar los logs si hay muchos.
    console.log(`[MyBookedTripsActions] First raw request object (with nested trip and profile):`, JSON.stringify(requests[0], null, 2));
  }

  const mappedTrips: BookedTrip[] = requests.map(req => {
    // req.trips es el objeto anidado de la tabla 'trips'
    const tripData = req.trips as any; 

    if (!tripData) {
      // Esto no debería suceder si la consulta y los joins son correctos, pero es una guarda.
      console.warn(`[MyBookedTripsActions] Request ID ${req.id} (trip_id: ${req.trip_id}) has no associated tripData. RLS on 'trips' might be blocking or data inconsistency.`);
      return null; // Se filtrará más adelante
    }
    
    // tripData.driver_profile es el objeto anidado de la tabla 'profiles' con el alias que le dimos
    const driverProfileData = tripData.driver_profile as any; 
    let driverInfo: DriverProfile | null = null;

    if (driverProfileData) {
      driverInfo = {
        fullName: driverProfileData.full_name,
        avatarUrl: driverProfileData.avatar_url,
      };
    } else {
      // Fallback si driverProfileData es null o undefined
      // (podría ser RLS en profiles, o driver_id es null en la tabla trips, o el perfil no existe)
      const driverIdShort = tripData.driver_id ? tripData.driver_id.substring(0, 6) : 'N/A';
      const initials = tripData.driver_id ? driverIdShort.substring(0,2).toUpperCase() : 'DR';
      driverInfo = {
        fullName: `Conductor (ID: ${driverIdShort}...)`, 
        avatarUrl: `https://placehold.co/100x100.png?text=${encodeURIComponent(initials)}`,
      };
      console.warn(`[MyBookedTripsActions] Profile data (tripData.driver_profile) not found or null for driver_id ${tripData.driver_id} on trip ${tripData.id}. Using fallback driver info. Raw tripData.driver_profile:`, JSON.stringify(driverProfileData, null, 2));
    }
    
    // Loguear para depuración
    // console.log(`[MyBookedTripsActions] Processing tripData for request ${req.id}:`, JSON.stringify(tripData, null, 2));
    // console.log(`[MyBookedTripsActions] Driver profile data (from driver_profile alias) for request ${req.id}:`, JSON.stringify(driverProfileData, null, 2));
    // console.log(`[MyBookedTripsActions] Resulting driverInfo for request ${req.id}:`, JSON.stringify(driverInfo, null, 2));

    return {
      requestId: req.id,
      tripId: tripData.id,
      origin: tripData.origin,
      destination: tripData.destination,
      departureDateTime: tripData.departure_datetime,
      driver: driverInfo,
      requestStatus: req.status,
      requestedAt: req.requested_at,
      seatsAvailableOnTrip: tripData.seats_available ?? 0, // Usar ?? 0 para manejar null/undefined
    };
  }).filter(trip => trip !== null) as BookedTrip[]; // Filtrar cualquier null resultante de tripData faltante

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
        console.error('[MyBookedTripsActions] User not authenticated for cancellation.');
        return { success: false, message: 'Usuario no autenticado.' };
    }

    console.log(`[MyBookedTripsActions] User ${user.id} attempting to cancel request ${requestId}`);

    try {
        // Llamada a la función RPC de Supabase
        // Asegúrate de que la función `cancel_passenger_trip_request` existe y funciona como se espera.
        // Esta función debería:
        // 1. Verificar que el `passenger_id` de la solicitud coincida con `auth.uid()`.
        // 2. Cambiar el estado de la solicitud a 'cancelled'.
        // 3. Si la solicitud estaba 'confirmed', incrementar `seats_available` en la tabla `trips`.
        // 4. Devolver un resultado indicando éxito/fracaso y un mensaje.
        const { data, error } = await supabase.rpc('cancel_passenger_trip_request', {
            p_request_id: requestId
        });

        if (error) {
            console.error('[MyBookedTripsActions] RPC error cancelling request:', JSON.stringify(error, null, 2));
            return { success: false, message: `Error al cancelar la solicitud: ${error.message}` };
        }

        // Asumimos que la RPC devuelve un objeto con { success: boolean, message: string, new_status: string | null }
        // Si la forma es diferente, ajusta esto.
        const result = data && Array.isArray(data) && data.length > 0 ? data[0] : data; // Si RPC devuelve un array de un solo objeto.

        if (result && result.success) {
            console.log(`[MyBookedTripsActions] Request ${requestId} cancelled successfully via RPC. New status: ${result.new_status}`);
            revalidatePath('/dashboard/passenger/my-booked-trips'); // Revalida la ruta para actualizar la UI
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

    
