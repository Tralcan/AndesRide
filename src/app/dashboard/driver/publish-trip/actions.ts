
// src/app/dashboard/driver/publish-trip/actions.ts
'use server';

import { createServerActionClient } from '@/lib/supabase/server';
import { watchRoute, type WatchRouteInput } from '@/ai/flows/route-watcher';
import { revalidatePath } from 'next/cache';
import { format, parseISO } from 'date-fns';

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
  // Asegúrate de que estos campos coincidan con tu tabla saved_routes
  created_at?: string; 
  // otros_campos?: any;
}

export async function processNewTripAndNotifyPassengersAction(
  tripData: NewTripData
): Promise<{ success: boolean; message: string; tripId?: string; notificationResults?: any[] }> {
  const supabase = createServerActionClient();
  console.log('[PublishTripActions] processNewTripAndNotifyPassengersAction called with tripData:', JSON.stringify(tripData, null, 2));
  
  const { data: { user: driverUser }, error: driverAuthError } = await supabase.auth.getUser();
  if (driverAuthError || !driverUser) {
    console.error('[PublishTripActions] Critical: Could not get driver user from Supabase Auth:', JSON.stringify(driverAuthError, null, 2));
    return { success: false, message: 'Error crítico: No se pudo autenticar al conductor para publicar el viaje.' };
  }
  console.log(`[PublishTripActions] Driver User ID performing action: ${driverUser.id}`);


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
  
  const newTripDateOnly = format(parseISO(newTrip.departure_datetime), 'yyyy-MM-dd');
  console.log(`[PublishTripActions] Formatted newTripDateOnly for matching: ${newTripDateOnly}`);

  revalidatePath('/dashboard/driver/manage-trips');
  revalidatePath('/dashboard/passenger/search-trips'); 

  // 2. Encontrar rutas guardadas coincidentes y notificar a los pasajeros
  try {
    console.log('[PublishTripActions] Attempting to fetch ALL saved_routes from DB for client-side filtering...');
    // Simplest possible query to fetch all saved routes
    const { data: allSavedRoutesRaw, error: fetchAllSavedRoutesError } = await supabase
      .from('saved_routes')
      .select('*'); // Fetch all columns for debugging

    if (fetchAllSavedRoutesError) {
      console.error('[PublishTripActions] supabase.from(\'saved_routes\').select(\'*\') FAILED. Error object:', JSON.stringify(fetchAllSavedRoutesError, null, 2));
      console.error(`[PublishTripActions] Error details: code=${fetchAllSavedRoutesError.code}, message=${fetchAllSavedRoutesError.message}, details=${fetchAllSavedRoutesError.details}, hint=${fetchAllSavedRoutesError.hint}`);
      // Si es un error RLS, el código podría ser 42501 (permission denied) o el mensaje indicarlo.
      return {
        success: true, 
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. Sin embargo, ocurrió un error GRAVE al buscar pasajeros interesados: ${fetchAllSavedRoutesError.message}. Revisa las políticas RLS de 'saved_routes'.`,
      };
    }
    
    console.log(`[PublishTripActions] ALL saved_routes fetched from DB (before any filtering): ${allSavedRoutesRaw?.length || 0} routes.`);
    if (allSavedRoutesRaw && allSavedRoutesRaw.length > 0) {
      console.log('[PublishTripActions] First raw saved route (if any):', JSON.stringify(allSavedRoutesRaw[0], null, 2));
    } else if (allSavedRoutesRaw === null) {
      console.log('[PublishTripActions] fetchAllSavedRoutes returned NULL. This usually means RLS prevented any rows from being returned, or the table is truly empty.');
    } else { // allSavedRoutesRaw is an empty array []
      console.log('[PublishTripActions] fetchAllSavedRoutes returned an EMPTY ARRAY. The table might be empty or RLS filtered everything out.');
    }


    if (!allSavedRoutesRaw || allSavedRoutesRaw.length === 0) {
      console.log('[PublishTripActions] No saved_routes data returned from Supabase. Check RLS on saved_routes or if the table is empty.');
      return {
        success: true,
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. No se encontraron rutas guardadas en la base de datos (o RLS impidió el acceso).`,
      };
    }

    const normalizedNewTripOrigin = newTrip.origin.trim().toLowerCase();
    const normalizedNewTripDestination = newTrip.destination.trim().toLowerCase();
    console.log(`[PublishTripActions] Normalized newTrip origin: "${normalizedNewTripOrigin}", destination: "${normalizedNewTripDestination}"`);

    const finalMatchingSavedRoutes: BasicSavedRoute[] = [];
    for (const sr of allSavedRoutesRaw as BasicSavedRoute[]) {
        console.log(`[PublishTripActions] --- Evaluating saved route ID ${sr.id} (Passenger: ${sr.passenger_id}) ---`);
        console.log(`  Raw SR: Origin='${sr.origin}', Dest='${sr.destination}', PrefDate='${sr.preferred_date}'`);

        const normalizedSavedRouteOrigin = sr.origin ? sr.origin.trim().toLowerCase() : "";
        const normalizedSavedRouteDestination = sr.destination ? sr.destination.trim().toLowerCase() : "";
        
        console.log(`  Normalized SR: Origin='${normalizedSavedRouteOrigin}', Dest='${normalizedSavedRouteDestination}'`);
        console.log(`  Normalized NT: Origin='${normalizedNewTripOrigin}', Dest='${normalizedNewTripDestination}', Date='${newTripDateOnly}'`);

        const originMatch = normalizedSavedRouteOrigin === normalizedNewTripOrigin;
        const destinationMatch = normalizedSavedRouteDestination === normalizedNewTripDestination;
        // Ensure sr.preferred_date is compared correctly (it can be null or a string 'YYYY-MM-DD')
        const dateConditionMet = sr.preferred_date === null || sr.preferred_date === '' || sr.preferred_date === newTripDateOnly;
        
        console.log(`  Match Results: OriginMatch=${originMatch}, DestMatch=${destinationMatch}, DateConditionMet=${dateConditionMet} (SR_PrefDate='${sr.preferred_date}', NT_Date='${newTripDateOnly}')`);

        if (originMatch && destinationMatch && dateConditionMet) {
            finalMatchingSavedRoutes.push(sr);
            console.log(`  --> Route ID ${sr.id} IS A MATCH.`);
        } else {
            console.log(`  --> Route ID ${sr.id} is NOT a match.`);
            if (!originMatch) console.log(`      Reason: Origin mismatch.`);
            if (!destinationMatch) console.log(`      Reason: Destination mismatch.`);
            if (!dateConditionMet) console.log(`      Reason: Date condition mismatch.`);
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
        origin: sr.origin, // Usar el origin original de la ruta guardada para el input del flow
        destination: sr.destination, // Usar el destination original
        date: sr.preferred_date || newTripDateOnly, // Usar la fecha guardada o la del nuevo viaje
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

  } catch (error: any) // Este catch es para errores inesperados en el proceso general de notificación
  {
    console.error('[PublishTripActions] Catch-all error during notification processing:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return {
      success: true, // El viaje se publicó, pero la notificación falló catastróficamente.
      tripId: newTrip.id,
      message: `Viaje publicado con ID: ${newTrip.id}. Ocurrió un error inesperado durante el proceso de notificación: ${error.message}`,
    };
  }
}

    
