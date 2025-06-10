
// src/app/dashboard/driver/publish-trip/actions.ts
'use server';

import { createServerActionClient } from '@/lib/supabase/server';
import { watchRoute, type WatchRouteInput } from '@/ai/flows/route-watcher';
import { revalidatePath } from 'next/cache';
import { format, parseISO } from 'date-fns';
import type { Trip } from '@supabase/supabase-js'; // Assuming Trip type might be useful

interface NewTripData {
  driver_id: string;
  origin: string;
  destination: string;
  departure_datetime: string; // ISO string
  seats_available: number;
}

interface SavedRouteForNotification {
  id: string;
  origin: string;
  destination: string;
  preferred_date: string | null; // YYYY-MM-DD or null
  passenger_email: string; // Email del pasajero
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
    .select('id, origin, destination, departure_datetime') // Seleccionar los datos necesarios para la notificación
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
  revalidatePath('/dashboard/passenger/search-trips'); // Para que aparezca en búsquedas

  // 2. Encontrar rutas guardadas coincidentes y notificar a los pasajeros
  const newTripDateOnly = format(parseISO(newTrip.departure_datetime), 'yyyy-MM-dd');
  console.log(`[PublishTripActions] New trip date for matching saved routes: ${newTripDateOnly}`);
  
  try {
    const { data: savedRoutes, error: fetchSavedRoutesError } = await supabase
      .from('saved_routes')
      .select(`
        id,
        origin,
        destination,
        preferred_date,
        passenger_profile:profiles (
          users (email)
        )
      `)
      .eq('origin', newTrip.origin)
      .eq('destination', newTrip.destination)
      // Condición de fecha: o no hay fecha preferida, o la fecha preferida coincide con la del nuevo viaje
      .or(`preferred_date.is.null,preferred_date.eq.${newTripDateOnly}`);

    if (fetchSavedRoutesError) {
      console.error('[PublishTripActions] Error fetching saved routes for notification:', JSON.stringify(fetchSavedRoutesError, null, 2));
      // Viaje publicado, pero no se pudieron buscar rutas guardadas. Informar al conductor.
      return {
        success: true, // El viaje se publicó
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
    const passengerNotificationDetails: SavedRouteForNotification[] = [];

    savedRoutes.forEach((sr: any) => {
      // Intentar extraer el email de diferentes estructuras posibles devueltas por Supabase
      let email: string | null = null;
      if (sr.passenger_profile?.users?.email) {
          email = sr.passenger_profile.users.email;
      } else if (Array.isArray(sr.passenger_profile?.users) && sr.passenger_profile.users.length > 0 && sr.passenger_profile.users[0]?.email) {
          email = sr.passenger_profile.users[0].email;
      } else if (sr.passenger_profile?.email) { // Si el email está directamente en profiles
          email = sr.passenger_profile.email;
      }

      if (email) {
        passengerNotificationDetails.push({
          id: sr.id,
          origin: sr.origin,
          destination: sr.destination,
          preferred_date: sr.preferred_date,
          passenger_email: email,
        });
      } else {
        console.warn(`[PublishTripActions] Could not extract email for saved route ID ${sr.id}, passenger_id ${sr.passenger_id}. Profile data:`, sr.passenger_profile);
      }
    });
    
    console.log('[PublishTripActions] Passenger details for notification:', passengerNotificationDetails);

    for (const detail of passengerNotificationDetails) {
      const watchInput: WatchRouteInput = {
        passengerEmail: detail.passenger_email,
        origin: detail.origin,
        destination: detail.destination,
        date: detail.preferred_date || newTripDateOnly, // Usar la fecha preferida si existe, sino la del nuevo viaje
      };
      console.log(`[PublishTripActions] Calling watchRoute for passenger ${detail.passenger_email} with input:`, watchInput);
      notificationPromises.push(
        watchRoute(watchInput)
          .then(output => ({ email: detail.passenger_email, success: true, output }))
          .catch(error => ({ email: detail.passenger_email, success: false, error: error.message || 'Unknown error from watchRoute' }))
      );
    }

    const notificationResults = await Promise.allSettled(notificationPromises);
    console.log('[PublishTripActions] Notification results:', notificationResults);
    
    // Filtrar para obtener solo los resultados cumplidos y con valor
    const fulfilledResults = notificationResults
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);

    const successfulNotifications = fulfilledResults.filter(r => r.success && r.output?.routeMatchFound && r.output?.notificationSent).length;

    return {
      success: true,
      tripId: newTrip.id,
      message: `Viaje publicado con ID: ${newTrip.id}. Se intentó notificar a ${passengerNotificationDetails.length} pasajero(s) (${successfulNotifications} notificaciones exitosas).`,
      notificationResults: fulfilledResults,
    };

  } catch (error: any) {
    console.error('[PublishTripActions] Catch-all error during notification processing:', error);
    return {
      success: true, // El viaje se publicó
      tripId: newTrip.id,
      message: `Viaje publicado con ID: ${newTrip.id}. Ocurrió un error inesperado durante el proceso de notificación: ${error.message}`,
    };
  }
}
