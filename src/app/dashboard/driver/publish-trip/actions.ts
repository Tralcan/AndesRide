// src/app/dashboard/driver/publish-trip/actions.ts
'use server';

import { createServerActionClient } from '@/lib/supabase/server';
import { watchRouteFlow, type WatchRouteInput } from '@/ai/flows/route-watcher'; // Importar watchRouteFlow
import { revalidatePath } from 'next/cache';
import { format, parseISO } from 'date-fns';

interface NewTripData {
  driver_id: string;
  origin: string;
  destination: string;
  departure_datetime: string; // ISO string
  seats_available: number;
}

interface BasicSavedRouteForNotification {
  id: string;
  passenger_id: string;
  passenger_email: string | null; // Columna clave para la notificación
  origin: string;
  destination: string;
  preferred_date: string | null; // YYYY-MM-DD or null
}

export async function processNewTripAndNotifyPassengersAction(
  tripData: NewTripData
): Promise<{ success: boolean; message: string; tripId?: string; notificationResults?: any[] }> {
  console.log('[PublishTripActions] Action initiated. TripData:', JSON.stringify(tripData, null, 2));

  const supabase = createServerActionClient();
  console.log('[PublishTripActions] Supabase client created for server action.');

  const { data: { user: driverUser }, error: driverAuthError } = await supabase.auth.getUser();

  if (driverAuthError) {
    console.error('[PublishTripActions] Authentication error:', JSON.stringify(driverAuthError, null, 2));
    return { success: false, message: `Error de autenticación: ${driverAuthError.message}` };
  }

  if (!driverUser) {
    console.error('[PublishTripActions] No authenticated user found. User is null.');
    return { success: false, message: 'Usuario no autenticado. No se puede publicar el viaje.' };
  }
  
  console.log(`[PublishTripActions] Authenticated driver user ID: ${driverUser.id}`);
  
  if (tripData.driver_id !== driverUser.id) {
    console.warn(`[PublishTripActions] Mismatch between provided driver_id (${tripData.driver_id}) and authenticated user_id (${driverUser.id}). Using authenticated user_id.`);
    tripData.driver_id = driverUser.id;
  }

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
  
  revalidatePath('/dashboard/driver/manage-trips');
  revalidatePath('/dashboard/passenger/search-trips'); 

  try {
    const newTripDateOnly = format(parseISO(newTrip.departure_datetime), 'yyyy-MM-dd');
    console.log(`[PublishTripActions] New trip details for matching: ID=${newTrip.id}, Origin=${newTrip.origin}, Dest=${newTrip.destination}, DateTime=${newTrip.departure_datetime}, FormattedDateOnly=${newTripDateOnly}`);

    console.log('[PublishTripActions] Attempting to fetch ALL saved_routes from DB...');
    const { data: allSavedRoutesRaw, error: fetchAllSavedRoutesError } = await supabase
      .from('saved_routes')
      .select('id, passenger_id, passenger_email, origin, destination, preferred_date'); 

    if (fetchAllSavedRoutesError) {
      console.error('[PublishTripActions] Error fetching saved_routes:', JSON.stringify(fetchAllSavedRoutesError, null, 2));
      return {
        success: true, 
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. Error al buscar pasajeros interesados: ${fetchAllSavedRoutesError.message}. Revisa los logs y RLS de 'saved_routes'.`,
      };
    }
    
    console.log(`[PublishTripActions] ALL saved_routes fetched from DB (before any filtering): ${allSavedRoutesRaw?.length || 0} routes.`);
    if (allSavedRoutesRaw && allSavedRoutesRaw.length > 0) {
      console.log('[PublishTripActions] First raw saved route (if any):', JSON.stringify(allSavedRoutesRaw[0], null, 2));
    }

    if (!allSavedRoutesRaw || allSavedRoutesRaw.length === 0) {
      console.log('[PublishTripActions] No saved_routes data returned from Supabase. Check RLS or if the table is empty.');
      return {
        success: true,
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. No se encontraron rutas guardadas en la base de datos.`,
      };
    }

    const normalizedNewTripOrigin = newTrip.origin.trim().toLowerCase();
    const normalizedNewTripDestination = newTrip.destination.trim().toLowerCase();
    console.log(`[PublishTripActions] Normalized newTrip: Origin='${normalizedNewTripOrigin}', Dest='${normalizedNewTripDestination}', Date='${newTripDateOnly}'`);

    const finalMatchingSavedRoutes: BasicSavedRouteForNotification[] = [];
    for (const sr of allSavedRoutesRaw as BasicSavedRouteForNotification[]) {
        console.log(`[PublishTripActions] --- Evaluating saved route ID ${sr.id} (Passenger: ${sr.passenger_id}, Email: ${sr.passenger_email}) ---`);
        console.log(`  Raw SR: Origin='${sr.origin}', Dest='${sr.destination}', PrefDate='${sr.preferred_date}'`);

        const normalizedSavedRouteOrigin = sr.origin ? sr.origin.trim().toLowerCase() : "";
        const normalizedSavedRouteDestination = sr.destination ? sr.destination.trim().toLowerCase() : "";
        
        const originMatch = normalizedSavedRouteOrigin === normalizedNewTripOrigin;
        const destinationMatch = normalizedSavedRouteDestination === normalizedNewTripDestination;
        const dateConditionMet = sr.preferred_date === null || sr.preferred_date === '' || sr.preferred_date === newTripDateOnly;
        
        console.log(`  Match Results: OriginMatch=${originMatch}, DestMatch=${destinationMatch}, DateConditionMet=${dateConditionMet}`);

        if (originMatch && destinationMatch && dateConditionMet) {
            if (sr.passenger_email && sr.passenger_email.trim() !== '') {
                finalMatchingSavedRoutes.push(sr);
                console.log(`  --> Route ID ${sr.id} IS A MATCH with valid email.`);
            } else {
                console.warn(`  --> Route ID ${sr.id} MATCHES but passenger_email is missing or empty. Skipping notification.`);
            }
        } else {
            console.log(`  --> Route ID ${sr.id} is NOT a match.`);
        }
    }
    
    console.log(`[PublishTripActions] Found ${finalMatchingSavedRoutes.length} fully matching saved routes with email AFTER detailed JavaScript filtering.`);

    if (finalMatchingSavedRoutes.length === 0) {
      console.log('[PublishTripActions] No saved routes fully matched (with email and all criteria) after filtering.');
      return {
        success: true,
        tripId: newTrip.id,
        message: `Viaje publicado con ID: ${newTrip.id}. No se encontraron pasajeros con rutas guardadas y email válido que coincidan completamente.`,
      };
    }

    const notificationPromises: Promise<any>[] = [];
    
    for (const sr of finalMatchingSavedRoutes) {
      const passengerEmail = sr.passenger_email!; 

      const watchInput: WatchRouteInput = {
        passengerEmail: passengerEmail,
        origin: sr.origin, 
        destination: sr.destination, 
        date: newTripDateOnly, // Usamos la fecha del viaje nuevo como referencia para la notificación
      };
      console.log(`[PublishTripActions] Calling watchRouteFlow for passenger ${passengerEmail} (Route ID: ${sr.id}) with input:`, JSON.stringify(watchInput, null, 2));
      
      notificationPromises.push(
        watchRouteFlow(watchInput) // Llamamos a watchRouteFlow directamente
          .then(output => {
            console.log(`[PublishTripActions] watchRouteFlow SUCCESS for ${passengerEmail} (Route ID: ${sr.id}):`, JSON.stringify(output, null, 2));
            return { email: passengerEmail, saved_route_id: sr.id, success: true, output };
          })
          .catch(error => {
            console.error(`[PublishTripActions] watchRouteFlow FAILED for ${passengerEmail} (Route ID: ${sr.id}):`, error.message ? error.message : JSON.stringify(error, null, 2));
            return { email: passengerEmail, saved_route_id: sr.id, success: false, error: error.message || 'Unknown error from watchRouteFlow' };
          })
      );
    }

    const notificationResults = await Promise.allSettled(notificationPromises);
    console.log('[PublishTripActions] All notification promises settled. Results:', JSON.stringify(notificationResults, null, 2));
    
    const fulfilledResults = notificationResults
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);

    const successfulNotifications = fulfilledResults.filter(r => r.success && r.output?.notificationSent).length;
    const totalAttempted = finalMatchingSavedRoutes.length;

    return {
      success: true,
      tripId: newTrip.id,
      message: `Viaje publicado con ID: ${newTrip.id}. Se intentó notificar a ${totalAttempted} pasajero(s) (${successfulNotifications} notificaciones exitosas). Revisa los logs del servidor para más detalles.`,
      notificationResults: fulfilledResults,
    };

  } catch (error: any) 
  {
    console.error('[PublishTripActions] Catch-all error during notification processing:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return {
      success: true, // El viaje se publicó, pero la notificación falló.
      tripId: newTrip.id,
      message: `Viaje publicado con ID: ${newTrip.id}. Ocurrió un error inesperado durante el proceso de notificación: ${error.message}. Por favor, revisa los logs del servidor.`,
    };
  }
}
```
</changes>
```