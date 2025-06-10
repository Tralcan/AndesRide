
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

interface BasicSavedRoute {
  id: string;
  passenger_id: string;
  origin: string;
  destination: string;
  preferred_date: string | null; // YYYY-MM-DD or null
}

export async function processNewTripAndNotifyPassengersAction(
  tripData: NewTripData
): Promise<{ success: boolean; message: string; tripId?: string; notificationResults?: any[] }> {
  const supabase = createServerActionClient();
  console.log('[PublishTripActions] processNewTripAndNotifyPassengersAction called with tripData:', JSON.stringify(tripData, null, 2));

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
  console.log('[PublishTripActions] New trip inserted successfully:', JSON.stringify(newTrip, null, 2));
  console.log(`[PublishTripActions] New trip details for matching: ID=${newTrip.id}, Origin=${newTrip.origin}, Dest=${newTrip.destination}, DateTime=${newTrip.departure_datetime}`);


  revalidatePath('/dashboard/driver/manage-trips');
  revalidatePath('/dashboard/passenger/search-trips'); 

  // 2. Encontrar rutas guardadas coincidentes y notificar a los pasajeros
  const newTripDateOnly = format(parseISO(newTrip.departure_datetime), 'yyyy-MM-dd');
  console.log(`[PublishTripActions] Formatted newTripDateOnly for matching: ${newTripDateOnly}`);
  
  try {
    // Obtener todas las rutas guardadas para depurar, luego filtraremos en el código.
    // Opcionalmente, podríamos filtrar por origin/destination aquí si es muy grande, pero para depurar veamos más.
    console.log(`[PublishTripActions] Querying saved_routes that match origin: "${newTrip.origin}" AND destination: "${newTrip.destination}"`);
    const { data: allSavedRoutesForOriginDest, error: fetchSavedRoutesError } = await supabase
      .from('saved_routes')
      .select('id, passenger_id, origin, destination, preferred_date')
      .eq('origin', newTrip.origin)
      .eq('destination', newTrip.destination);


    if (fetchSavedRoutesError) {
      console.error('[PublishTripActions] Error fetching saved routes (by origin/dest) for notification:', JSON.stringify(fetchSavedRoutesError, null, 2));
      return {
        success: true, 
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. Sin embargo, ocurrió un error al buscar pasajeros interesados (fase 1): ${fetchSavedRoutesError.message}`,
      };
    }
    
    console.log(`[PublishTripActions] Initial matching saved_routes by origin/destination (before date filter): ${allSavedRoutesForOriginDest?.length || 0} routes. Data:`, JSON.stringify(allSavedRoutesForOriginDest, null, 2));

    if (!allSavedRoutesForOriginDest || allSavedRoutesForOriginDest.length === 0) {
      console.log('[PublishTripActions] No saved routes found matching origin and destination of the new trip.');
      return {
        success: true,
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. No se encontraron pasajeros con rutas guardadas coincidentes (por origen/destino) en este momento.`,
      };
    }

    const finalMatchingSavedRoutes: BasicSavedRoute[] = [];
    for (const sr of allSavedRoutesForOriginDest as BasicSavedRoute[]) {
        console.log(`[PublishTripActions] Evaluating saved route ID ${sr.id}: Origin="${sr.origin}", Dest="${sr.destination}", PrefDate="${sr.preferred_date}"`);
        const originMatch = sr.origin === newTrip.origin;
        const destinationMatch = sr.destination === newTrip.destination;
        const dateConditionMet = sr.preferred_date === null || sr.preferred_date === newTripDateOnly;
        
        console.log(`  - SR Origin ("${sr.origin}") vs NewTrip Origin ("${newTrip.origin}"): ${originMatch}`);
        console.log(`  - SR Dest ("${sr.destination}") vs NewTrip Dest ("${newTrip.destination}"): ${destinationMatch}`);
        console.log(`  - SR PrefDate ("${sr.preferred_date}") vs NewTripDateOnly ("${newTripDateOnly}"): Date Condition Met = ${dateConditionMet} (PrefDate is null? ${sr.preferred_date === null}, PrefDate equals NewTripDateOnly? ${sr.preferred_date === newTripDateOnly})`);

        if (originMatch && destinationMatch && dateConditionMet) {
            finalMatchingSavedRoutes.push(sr);
            console.log(`  --> Route ID ${sr.id} IS a match.`);
        } else {
            console.log(`  --> Route ID ${sr.id} is NOT a match. OriginMatch=${originMatch}, DestinationMatch=${destinationMatch}, DateConditionMet=${dateConditionMet}`);
        }
    }
    
    console.log(`[PublishTripActions] Found ${finalMatchingSavedRoutes.length} fully matching saved routes AFTER detailed filtering.`);


    if (finalMatchingSavedRoutes.length === 0) {
      console.log('[PublishTripActions] No saved routes fully matched after date filtering.');
      return {
        success: true,
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. No se encontraron pasajeros con rutas guardadas que coincidan completamente (incluyendo fecha) en este momento.`,
      };
    }


    const notificationPromises: Promise<any>[] = [];
    
    for (const sr of finalMatchingSavedRoutes) {
      console.log(`[PublishTripActions] Processing matched saved route ID ${sr.id} for passenger_id: ${sr.passenger_id}`);
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('email') 
        .eq('id', sr.passenger_id) 
        .single();

      if (profileError || !profileData?.email) {
        console.warn(`[PublishTripActions] Could not fetch email for passenger_id ${sr.passenger_id} from profiles table. Error: ${profileError ? JSON.stringify(profileError, null, 2) : 'No email in profileData'}. Skipping notification for this route.`);
        continue; 
      }
      
      const passengerEmail = profileData.email;
      console.log(`[PublishTripActions] Fetched email "${passengerEmail}" for passenger_id ${sr.passenger_id}.`);

      const watchInput: WatchRouteInput = {
        passengerEmail: passengerEmail,
        origin: sr.origin, // Usar el origen/destino de la ruta guardada
        destination: sr.destination,
        date: sr.preferred_date || newTripDateOnly, // Usar la fecha guardada, o la del nuevo viaje si la guardada es null
      };
      console.log(`[PublishTripActions] Calling watchRoute for passenger ${passengerEmail} (Route ID: ${sr.id}) with input:`, JSON.stringify(watchInput, null, 2));
      
      notificationPromises.push(
        watchRoute(watchInput)
          .then(output => {
            console.log(`[PublishTripActions] watchRoute SUCCESS for ${passengerEmail} (Route ID: ${sr.id}):`, JSON.stringify(output, null, 2));
            return { email: passengerEmail, saved_route_id: sr.id, success: true, output };
          })
          .catch(error => {
            console.error(`[PublishTripActions] watchRoute FAILED for ${passengerEmail} (Route ID: ${sr.id}):`, error.message ? error.message : JSON.stringify(error, null, 2));
            return { email: passengerEmail, saved_route_id: sr.id, success: false, error: error.message || 'Unknown error from watchRoute' };
          })
      );
    }

    const notificationResults = await Promise.allSettled(notificationPromises);
    console.log('[PublishTripActions] All notification promises settled. Results:', JSON.stringify(notificationResults, null, 2));
    
    const fulfilledResults = notificationResults
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);

    const successfulNotifications = fulfilledResults.filter(r => r.success && r.output?.routeMatchFound && r.output?.notificationSent).length;
    const totalAttempted = finalMatchingSavedRoutes.length;

    return {
      success: true,
      tripId: newTrip.id,
      message: `Viaje publicado con ID: ${newTrip.id}. Se intentó notificar a ${totalAttempted} pasajero(s) (${successfulNotifications} notificaciones exitosas). Revisa los logs del servidor para más detalles.`,
      notificationResults: fulfilledResults,
    };

  } catch (error: any) {
    console.error('[PublishTripActions] Catch-all error during notification processing:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return {
      success: true, 
      tripId: newTrip.id,
      message: `Viaje publicado con ID: ${newTrip.id}. Ocurrió un error inesperado durante el proceso de notificación: ${error.message}`,
    };
  }
}

    
