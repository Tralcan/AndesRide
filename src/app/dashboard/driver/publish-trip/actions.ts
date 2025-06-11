
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
  
  const normalizedNewTripOrigin = newTrip.origin.trim().toLowerCase();
  const normalizedNewTripDestination = newTrip.destination.trim().toLowerCase();
  console.log(`[PublishTripActions] Normalized newTrip origin: "${normalizedNewTripOrigin}", destination: "${normalizedNewTripDestination}"`);
  console.log(`[PublishTripActions] Original newTrip DateTime: ${newTrip.departure_datetime}`);


  revalidatePath('/dashboard/driver/manage-trips');
  revalidatePath('/dashboard/passenger/search-trips'); 

  // 2. Encontrar rutas guardadas coincidentes y notificar a los pasajeros
  const newTripDateOnly = format(parseISO(newTrip.departure_datetime), 'yyyy-MM-dd');
  console.log(`[PublishTripActions] Formatted newTripDateOnly for matching: ${newTripDateOnly}`);
  
  try {
    // Obtener TODAS las rutas guardadas para depurar la lógica de coincidencia en el código.
    console.log('[PublishTripActions] Fetching ALL saved_routes from DB for client-side filtering...');
    const { data: allSavedRoutesRaw, error: fetchAllSavedRoutesError } = await supabase
      .from('saved_routes')
      .select('*'); // Seleccionamos todo para inspeccionar

    if (fetchAllSavedRoutesError) {
      console.error('[PublishTripActions] Error fetching ALL saved routes:', JSON.stringify(fetchAllSavedRoutesError, null, 2));
      return {
        success: true, 
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. Sin embargo, ocurrió un error al buscar pasajeros interesados (fase fetch all): ${fetchAllSavedRoutesError.message}`,
      };
    }
    
    console.log(`[PublishTripActions] ALL saved_routes fetched from DB (before any filtering): ${allSavedRoutesRaw?.length || 0} routes. Data:`, JSON.stringify(allSavedRoutesRaw, null, 2));

    if (!allSavedRoutesRaw || allSavedRoutesRaw.length === 0) {
      console.log('[PublishTripActions] No saved routes found in the database at all.');
      return {
        success: true,
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. No hay ninguna ruta guardada por ningún pasajero en la base de datos.`,
      };
    }

    const finalMatchingSavedRoutes: BasicSavedRoute[] = [];
    for (const sr of allSavedRoutesRaw as BasicSavedRoute[]) {
        const normalizedSavedRouteOrigin = sr.origin.trim().toLowerCase();
        const normalizedSavedRouteDestination = sr.destination.trim().toLowerCase();

        const originMatch = normalizedSavedRouteOrigin === normalizedNewTripOrigin;
        const destinationMatch = normalizedSavedRouteDestination === normalizedNewTripDestination;
        const dateConditionMet = sr.preferred_date === null || sr.preferred_date === newTripDateOnly;
        
        console.log(`[PublishTripActions] Evaluating saved route ID ${sr.id}:`);
        console.log(`  - SR Origin (raw): "${sr.origin}" -> Normalized: "${normalizedSavedRouteOrigin}"`);
        console.log(`  - NT Origin (norm): "${normalizedNewTripOrigin}" | Match: ${originMatch}`);
        console.log(`  - SR Dest (raw): "${sr.destination}" -> Normalized: "${normalizedSavedRouteDestination}"`);
        console.log(`  - NT Dest (norm): "${normalizedNewTripDestination}" | Match: ${destinationMatch}`);
        console.log(`  - SR PrefDate: "${sr.preferred_date}" | NT DateOnly: "${newTripDateOnly}" | Date Condition Met: ${dateConditionMet}`);

        if (originMatch && destinationMatch && dateConditionMet) {
            finalMatchingSavedRoutes.push(sr);
            console.log(`  --> Route ID ${sr.id} IS A MATCH.`);
        } else {
            console.log(`  --> Route ID ${sr.id} is NOT a match. Details: OriginMatch=${originMatch}, DestMatch=${destinationMatch}, DateConditionMet=${dateConditionMet}`);
        }
    }
    
    console.log(`[PublishTripActions] Found ${finalMatchingSavedRoutes.length} fully matching saved routes AFTER detailed JavaScript filtering.`);

    if (finalMatchingSavedRoutes.length === 0) {
      console.log('[PublishTripActions] No saved routes fully matched after detailed JavaScript filtering.');
      return {
        success: true,
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. No se encontraron pasajeros con rutas guardadas que coincidan completamente (origen, destino, fecha) tras la verificación detallada.`,
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
        origin: sr.origin, 
        destination: sr.destination,
        date: sr.preferred_date || newTripDateOnly, 
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
