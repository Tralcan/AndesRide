// src/app/dashboard/passenger/saved-routes/actions.ts
'use server';

import { createServerActionClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale/es'; // Para formatear fechas al español

const SavedRouteSchemaForDB = z.object({
  origin: z.string().min(1, "El origen es requerido."),
  destination: z.string().min(1, "El destino es requerido."),
  preferred_date: z.string().nullable().optional(), // Fecha como ISO string YYYY-MM-DD o null
  passenger_email: z.string().email("Email del pasajero inválido").optional().nullable(),
});

export interface SavedRouteFromDB {
  id: string;
  passenger_id: string;
  passenger_email: string | null;
  origin: string;
  destination: string;
  preferred_date: string | null; // ISO string YYYY-MM-DD
  created_at: string;
}

export async function getSavedRoutesAction(): Promise<{ success: boolean; routes?: SavedRouteFromDB[]; error?: string }> {
  const supabase = createServerActionClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('[getSavedRoutesAction] Auth error:', authError);
    return { success: false, error: 'Usuario no autenticado.' };
  }

  try {
    console.log(`[getSavedRoutesAction] Fetching routes for passenger_id: ${user.id}`);
    const { data, error } = await supabase
      .from('saved_routes')
      .select('*')
      .eq('passenger_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[getSavedRoutesAction] Error fetching saved routes:', error);
      return { success: false, error: error.message };
    }
    console.log(`[getSavedRoutesAction] Successfully fetched ${data?.length || 0} routes.`);
    return { success: true, routes: data || [] };
  } catch (e: any) {
    console.error('[getSavedRoutesAction] Exception:', e);
    return { success: false, error: e.message || 'Error inesperado al obtener rutas guardadas.' };
  }
}

export async function addSavedRouteAction(
  routeData: z.infer<typeof SavedRouteSchemaForDB>
): Promise<{ success: boolean; route?: SavedRouteFromDB; error?: string; errorDetails?: any }> {
  console.log('[addSavedRouteAction] Attempting to add saved route. Input data:', routeData);
  const supabase = createServerActionClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    console.error('[addSavedRouteAction] Auth error or user email missing:', authError, user);
    return { success: false, error: 'Usuario no autenticado o email no disponible.' };
  }
  console.log(`[addSavedRouteAction] Authenticated user: ${user.id}, email: ${user.email}`);

  const dataWithAuthenticatedUserEmail = {
    ...routeData,
    passenger_email: user.email, 
  };

  const validatedData = SavedRouteSchemaForDB.safeParse(dataWithAuthenticatedUserEmail);
  if (!validatedData.success) {
    const errorMessage = validatedData.error.flatten().fieldErrors?.join(', ') || "Error de validación desconocido.";
    console.error('[addSavedRouteAction] Validation failed:', errorMessage, validatedData.error.issues);
    return { success: false, error: errorMessage, errorDetails: validatedData.error.flatten() };
  }
  console.log('[addSavedRouteAction] Validation successful. Validated data:', validatedData.data);

  const dataToInsert = {
    passenger_id: user.id,
    passenger_email: validatedData.data.passenger_email,
    origin: validatedData.data.origin,
    destination: validatedData.data.destination,
    preferred_date: validatedData.data.preferred_date,
  };
  console.log('[addSavedRouteAction] Data to insert into DB:', dataToInsert);

  try {
    const { data: newRoute, error: insertError } = await supabase
      .from('saved_routes')
      .insert(dataToInsert)
      .select()
      .single();

    if (insertError) {
      console.error('[addSavedRouteAction] Error inserting saved route into DB:', JSON.stringify(insertError, null, 2));
      if (insertError.message.includes("violates row-level security policy") || insertError.message.includes("permission denied")) {
        return { success: false, error: `Error de RLS: No tienes permiso para guardar la ruta. Verifica las políticas INSERT en la tabla 'saved_routes'. Detalles: ${insertError.message}`, errorDetails: insertError };
      }
      return { success: false, error: `Error al guardar en DB: ${insertError.message}`, errorDetails: insertError };
    }

    if (!newRoute) {
        console.error('[addSavedRouteAction] Insert successful but no route data returned from DB.');
        return { success: false, error: 'La ruta se guardó, por alguna razón no se recibieron datos de confirmación de la base de datos. Revisa la tabla directamente.' };
    }

    console.log('[addSavedRouteAction] Successfully inserted route into DB. New route data:', newRoute);
    revalidatePath('/dashboard/passenger/saved-routes');
    return { success: true, route: newRoute };
  } catch (e: any) {
    console.error('[addSavedRouteAction] Exception during DB operation:', e);
    return { success: false, error: e.message || 'Error inesperado al guardar la ruta.', errorDetails: e };
  }
}

export async function deleteSavedRouteAction(routeId: string): Promise<{ success: boolean; error?: string }> {
  console.log(`[deleteSavedRouteAction] Attempting to delete route with id: ${routeId}`);
  const supabase = createServerActionClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('[deleteSavedRouteAction] Auth error:', authError);
    return { success: false, error: 'Usuario no autenticado.' };
  }
  console.log(`[deleteSavedRouteAction] Authenticated user: ${user.id}`);

  try {
    const { error } = await supabase
      .from('saved_routes')
      .delete()
      .eq('id', routeId)
      .eq('passenger_id', user.id); 

    if (error) {
      console.error('[deleteSavedRouteAction] Error deleting saved route from DB:', error);
       if (error.message.includes("violates row-level security policy") || error.message.includes("permission denied")) {
        return { success: false, error: `Error de RLS: No tienes permiso para eliminar esta ruta. Verifica las políticas DELETE en la tabla 'saved_routes'. Detalles: ${error.message}` };
      }
      return { success: false, error: error.message };
    }

    console.log(`[deleteSavedRouteAction] Successfully deleted route ${routeId} from DB.`);
    revalidatePath('/dashboard/passenger/saved-routes');
    return { success: true };
  } catch (e: any) {
    console.error('[deleteSavedRouteAction] Exception during DB operation:', e);
    return { success: false, error: e.message || 'Error inesperado al eliminar la ruta.' };
  }
}

export interface PublishedTripDetails {
  tripId: string;
  driverEmail: string | null;
  driverFullName: string | null;
  departureDateTime: string; // Formatted string: "dd de MMMM de yyyy a las HH:mm hrs (UTC)"
  departureDateFormatted: string; // Formatted string: "dd de MMMM de yyyy" (UTC)
  origin: string;
  destination: string;
  seatsAvailable: number;
}

const FindPublishedMatchingTripsInputSchema = z.object({
  origin: z.string().describe("La ubicación de origen del viaje deseado."),
  destination: z.string().describe("La ubicación de destino del viaje deseado."),
  searchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe estar en formato YYYY-MM-DD.").describe("La fecha deseada para el viaje (YYYY-MM-DD)."),
});
export type FindPublishedMatchingTripsInput = z.infer<typeof FindPublishedMatchingTripsInputSchema>;


export async function findPublishedMatchingTripsAction(
  input: FindPublishedMatchingTripsInput
): Promise<PublishedTripDetails[]> {
  console.log(`[findPublishedMatchingTripsAction] Received input: origin="${input.origin}", destination="${input.destination}", searchDate="${input.searchDate}"`);
  
  const validation = FindPublishedMatchingTripsInputSchema.safeParse(input);
  if (!validation.success) {
    console.error('[findPublishedMatchingTripsAction] Invalid input:', validation.error.flatten());
    return [];
  }
  const validatedInput = validation.data;

  const supabase = createServerActionClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.warn('[findPublishedMatchingTripsAction] No authenticated user for this action call, but proceeding (system context).');
  } else {
    console.log(`[findPublishedMatchingTripsAction] Action called by or in context of user: ${user.id}`);
  }

  try {
    const rpcParams = {
      p_origin: validatedInput.origin,
      p_destination: validatedInput.destination,
      p_search_date_str: validatedInput.searchDate,
    };
    console.log('[findPublishedMatchingTripsAction] Calling RPC search_trips_with_driver_info with params:', JSON.stringify(rpcParams, null, 2));

    const { data: tripsData, error: rpcError } = await supabase.rpc('search_trips_with_driver_info', rpcParams);

    if (rpcError) {
      console.error('[findPublishedMatchingTripsAction] Error calling RPC search_trips_with_driver_info:', JSON.stringify(rpcError, null, 2));
      return []; 
    }

    if (!tripsData || tripsData.length === 0) {
      console.log('[findPublishedMatchingTripsAction] No matching trips found by RPC for input:', JSON.stringify(validatedInput, null, 2));
      return [];
    }

    console.log(`[findPublishedMatchingTripsAction] Found ${tripsData.length} trips via RPC.`);

    const results: PublishedTripDetails[] = tripsData.map((trip: any) => {
      let departureDateTimeUTC = "Fecha y hora no disponibles (UTC)";
      let departureDateFormattedUTC = "Fecha no disponible";

      if (trip.departure_datetime) {
        try {
          const parsedDateTime = parseISO(trip.departure_datetime); // Esta es UTC
          if (isValid(parsedDateTime)) {
            // Formato para el cuerpo del email (más detallado, especificando UTC)
            departureDateTimeUTC = format(parsedDateTime, "dd 'de' MMMM 'de' yyyy 'a las' HH:mm 'hrs (UTC)'", { locale: es });
            // Formato para el asunto del email (más corto)
            departureDateFormattedUTC = format(parsedDateTime, "dd 'de' MMMM 'de' yyyy", { locale: es });
          } else {
            console.warn(`[findPublishedMatchingTripsAction] Invalid date string from DB for trip ${trip.id}: ${trip.departure_datetime}`);
          }
        } catch (e) {
          console.warn(`[findPublishedMatchingTripsAction] Error parsing or formatting date ${trip.departure_datetime} for trip ${trip.id}:`, e);
        }
      } else {
        console.warn(`[findPublishedMatchingTripsAction] Missing departure_datetime for trip ${trip.id}`);
      }
      
      return {
        tripId: trip.id, 
        driverEmail: trip.driver_email || null,
        driverFullName: trip.driver_name || 'Conductor Anónimo',
        departureDateTime: departureDateTimeUTC, // Usar la versión formateada UTC
        departureDateFormatted: departureDateFormattedUTC, // Usar la versión formateada solo fecha UTC
        origin: trip.origin,
        destination: trip.destination,
        seatsAvailable: trip.seats_available,
      };
    });

    console.log(`[findPublishedMatchingTripsAction] Mapped ${results.length} trips. First mapped result (if any):`, results.length > 0 ? JSON.stringify(results[0], null, 2) : "N/A");
    return results;

  } catch (e: any) {
    console.error('[findPublishedMatchingTripsAction] Exception caught in findPublishedMatchingTripsAction:', e);
    return []; 
  }
}
