
// src/app/dashboard/driver/publish-trip/actions.ts
'use server';

import { createServerActionClient } from '@/lib/supabase/server';
import { watchRoute, type WatchRouteInput } from '@/ai/flows/route-watcher';
import { revalidatePath } from 'next/cache';
import { format, parseISO } from 'date-fns';
import type { Trip } from '@supabase/supabase-js'; 

interface NewTripData {
  driver_id: string;
  origin: string;
  destination: string;
  departure_datetime: string; // ISO string
  seats_available: number;
}

interface SavedRouteForNotification {
  id: string; // saved_route_id
  origin: string;
  destination: string;
  preferred_date: string | null; // YYYY-MM-DD or null
  passenger_email: string; 
}

interface BasicSavedRoute {
  id: string;
  passenger_id: string;
  origin: string;
  destination: string;
  preferred_date: string | null;
}

export async function processNewTripAndNotifyPassengersAction(
  tripData: NewTripData
): Promise<{ success: boolean; message: string; tripId?: string; notificationResults?: any[] }> {
  const supabase = createServerActionClient();
  console.log('[PublishTripActions] processNewTripAndNotifyPassengersAction called with tripData:', tripData);

  // 1. Insertar el nuevo viaje
  const { data: newTrip, error: insertTripError } = await supabase
    .from('trips')
    .insert(tripData)
    .select('id, origin, destination, departure_datetime') 
    .single();

  if (insertTripError || !newTrip) {
    console.error('[PublishTripActions] Error inserting new trip:', JSON.stringify(insertTripError, null, 2));
    return {
      success: false,
      message: `Error al publicar el viaje: ${insertTripError?.message || 'No se pudo guardar el viaje.'}`,
    };
  }
  console.log('[PublishTripActions] New trip inserted successfully:', newTrip);

  revalidatePath('/dashboard/driver/manage-trips');
  revalidatePath('/dashboard/passenger/search-trips'); 

  // 2. Encontrar rutas guardadas coincidentes y notificar a los pasajeros
  const newTripDateOnly = format(parseISO(newTrip.departure_datetime), 'yyyy-MM-dd');
  console.log(`[PublishTripActions] New trip date for matching saved routes: ${newTripDateOnly}`);
  
  try {
    const { data: savedRoutes, error: fetchSavedRoutesError } = await supabase
      .from('saved_routes')
      .select('id, passenger_id, origin, destination, preferred_date') // Seleccionar campos necesarios
      .eq('origin', newTrip.origin)
      .eq('destination', newTrip.destination)
      .or(`preferred_date.is.null,preferred_date.eq.${newTripDateOnly}`);

    if (fetchSavedRoutesError) {
      console.error('[PublishTripActions] Error fetching saved routes for notification:', JSON.stringify(fetchSavedRoutesError, null, 2));
      return {
        success: true, 
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. Sin embargo, ocurrió un error al buscar pasajeros interesados: ${fetchSavedRoutesError.message}`,
      };
    }

    if (!savedRoutes || savedRoutes.length === 0) {
      console.log('[PublishTripActions] No matching saved routes found for the new trip.');
      return {
        success: true,
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. No se encontraron pasajeros con rutas guardadas coincidentes en este momento.`,
      };
    }

    console.log(`[PublishTripActions] Found ${savedRoutes.length} potentially matching saved routes.`);
    const notificationPromises: Promise<any>[] = [];
    
    for (const sr of savedRoutes as BasicSavedRoute[]) {
      // Para cada ruta guardada, obtener el email del pasajero desde la tabla profiles
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('email') // Asume que 'email' está en la tabla 'profiles'
        .eq('id', sr.passenger_id) // Asume que 'profiles.id' es el user_id
        .single();

      if (profileError || !profileData?.email) {
        console.warn(`[PublishTripActions] Could not fetch email for passenger_id ${sr.passenger_id} from profiles table. Error: ${profileError?.message}. Skipping notification for this route.`);
        continue; // Saltar a la siguiente ruta guardada
      }
      
      const passengerEmail = profileData.email;

      const watchInput: WatchRouteInput = {
        passengerEmail: passengerEmail,
        origin: sr.origin,
        destination: sr.destination,
        date: sr.preferred_date || newTripDateOnly, 
      };
      console.log(`[PublishTripActions] Calling watchRoute for passenger ${passengerEmail} (ID: ${sr.passenger_id}) with input:`, watchInput);
      notificationPromises.push(
        watchRoute(watchInput)
          .then(output => ({ email: passengerEmail, success: true, output }))
          .catch(error => ({ email: passengerEmail, success: false, error: error.message || 'Unknown error from watchRoute' }))
      );
    }

    const notificationResults = await Promise.allSettled(notificationPromises);
    console.log('[PublishTripActions] Notification results:', notificationResults);
    
    const fulfilledResults = notificationResults
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);

    const successfulNotifications = fulfilledResults.filter(r => r.success && r.output?.routeMatchFound && r.output?.notificationSent).length;
    const totalAttempted = savedRoutes.length;

    return {
      success: true,
      tripId: newTrip.id,
      message: `Viaje publicado con ID: ${newTrip.id}. Se intentó notificar a ${totalAttempted} pasajero(s) (${successfulNotifications} notificaciones exitosas).`,
      notificationResults: fulfilledResults,
    };

  } catch (error: any) {
    console.error('[PublishTripActions] Catch-all error during notification processing:', error);
    return {
      success: true, 
      tripId: newTrip.id,
      message: `Viaje publicado con ID: ${newTrip.id}. Ocurrió un error inesperado durante el proceso de notificación: ${error.message}`,
    };
  }
}
