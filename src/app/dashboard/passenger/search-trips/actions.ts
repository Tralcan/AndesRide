
// src/app/dashboard/passenger/search-trips/actions.ts
'use server';

import { supabase } from '@/lib/supabaseClient';
import { z } from 'zod';
// format, startOfDay, endOfDay, parseISO are not directly used here anymore for search, but might be for other actions.
// For now, keeping imports minimal.

const SearchFiltersSchema = z.object({
  origin: z.string().optional(),
  destination: z.string().optional(),
  date: z.string().optional(), // Date as ISO string or YYYY-MM-DD
});

export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

export interface TripSearchResult {
  id: string;
  driverName: string | null; 
  driverAvatar: string | null;
  origin: string;
  destination:string;
  departure_datetime: string; // ISO string
  availableSeats: number; 
}

const ANY_ORIGIN_VALUE = "_ANY_ORIGIN_";
const ANY_DESTINATION_VALUE = "_ANY_DESTINATION_";

export async function searchSupabaseTrips(filters: SearchFilters): Promise<TripSearchResult[]> {
  console.log('[searchSupabaseTrips] Received filters for RPC call:', JSON.stringify(filters, null, 2));

  const params = {
    p_origin: (filters.origin && filters.origin !== ANY_ORIGIN_VALUE) ? filters.origin : null,
    p_destination: (filters.destination && filters.destination !== ANY_DESTINATION_VALUE) ? filters.destination : null,
    p_search_date_str: (filters.date && filters.date !== "" && filters.date !== undefined) ? filters.date : null,
  };

  console.log('[searchSupabaseTrips] Parameters for RPC call search_trips_with_driver_info:', params);

  try {
    const { data, error } = await supabase.rpc('search_trips_with_driver_info', params);

    if (error) {
      console.error("[searchSupabaseTrips] Error calling RPC search_trips_with_driver_info:", JSON.stringify(error, null, 2));
      throw error;
    }

    console.log('[searchSupabaseTrips] Raw data from RPC:', data ? `${data.length} rows` : 'No data');
    if (data && data.length > 0) {
        console.log('[searchSupabaseTrips] First raw row from RPC:', JSON.stringify(data[0], null, 2));
    }

    if (!data) {
      return [];
    }

    const results: TripSearchResult[] = data.map((trip_from_rpc: any) => {
      const driverName = trip_from_rpc.driver_name || 'Conductor Anónimo'; 
      let driverAvatar = trip_from_rpc.driver_avatar;

      if (!driverAvatar || (typeof driverAvatar === 'string' && driverAvatar.trim() === '')) {
        const initials = (driverName.substring(0, 2).toUpperCase() || 'CA');
        driverAvatar = `https://placehold.co/100x100.png?text=${encodeURIComponent(initials)}`;
      }

      return {
        id: trip_from_rpc.id,
        origin: trip_from_rpc.origin,
        destination: trip_from_rpc.destination,
        departure_datetime: trip_from_rpc.departure_datetime,
        availableSeats: trip_from_rpc.seats_available, 
        driverName: driverName,
        driverAvatar: driverAvatar,
      };
    }).filter(trip => trip.id); 
    
    console.log('[searchSupabaseTrips] Transformed results from RPC:', results.length > 0 ? `${results.length} results, first: ${JSON.stringify(results[0], null, 2)}` : 'No results after transformation.');
    return results;

  } catch (error) {
    console.error('[searchSupabaseTrips] Catch-all error in searchSupabaseTrips (RPC path):', error);
    return []; 
  }
}

export interface RequestTripSeatResult {
  success: boolean;
  message: string;
  alreadyRequested?: boolean;
}

export async function requestTripSeatAction(tripId: string): Promise<RequestTripSeatResult> {
  try {
    // Obtener el usuario autenticado directamente en la Server Action
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('[requestTripSeatAction] Error fetching user for request:', authError);
      return { success: false, message: "Error de autenticación al obtener usuario: " + authError.message };
    }
    
    if (!user) {
      console.warn('[requestTripSeatAction] User not authenticated when trying to request seat.');
      return { success: false, message: "Usuario no autenticado." };
    }
    const passenger_id = user.id;

    // Primero, verificar si el usuario ya ha solicitado este viaje
    const { data: existingRequest, error: selectError } = await supabase
      .from('trip_requests')
      .select('id')
      .eq('trip_id', tripId)
      .eq('passenger_id', passenger_id)
      .maybeSingle();

    if (selectError) {
      console.error('[requestTripSeatAction] Error checking for existing request:', selectError);
      return { success: false, message: "Error al verificar solicitud existente: " + selectError.message };
    }

    if (existingRequest) {
      return { success: true, message: "Ya has solicitado un asiento en este viaje.", alreadyRequested: true };
    }
    
    // La función RPC search_trips_with_driver_info ya debería filtrar viajes sin cupos.
    // Pero una verificación adicional antes de insertar no hace daño, aunque puede haber una condición de carrera.
    // Por simplicidad, confiaremos en la restricción de la base de datos o en la lógica de la función RPC.
    // Si fuera necesario, se podría añadir una llamada RPC aquí para verificar cupos de forma atómica
    // o una lógica más compleja.

    const { error: insertError } = await supabase
      .from('trip_requests')
      .insert({ trip_id: tripId, passenger_id: passenger_id, status: 'pending' });

    if (insertError) {
      if (insertError.code === '23505') { 
        console.warn('[requestTripSeatAction] Attempted to request already requested trip (caught by DB constraint):', insertError);
        return { success: true, message: "Ya has solicitado un asiento en este viaje.", alreadyRequested: true };
      }
      console.error('[requestTripSeatAction] Error inserting trip request:', insertError);
      // Podríamos intentar obtener un mensaje más amigable si es un error de RLS o FK
      return { success: false, message: "Error al solicitar el asiento: " + insertError.message };
    }

    return { success: true, message: "¡Asiento solicitado con éxito! El conductor será notificado." };

  } catch (error: any) {
    console.error('[requestTripSeatAction] Catch-all error:', error);
    return { success: false, message: "Ocurrió un error inesperado: " + error.message };
  }
}
