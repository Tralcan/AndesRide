
// src/app/dashboard/passenger/saved-routes/actions.ts
'use server';

import { createServerActionClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const SavedRouteSchemaForDB = z.object({
  origin: z.string().min(1, "El origen es requerido."),
  destination: z.string().min(1, "El destino es requerido."),
  preferred_date: z.string().nullable().optional(), // Fecha como ISO string YYYY-MM-DD o null
});

export interface SavedRouteFromDB {
  id: string;
  passenger_id: string;
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

  if (authError || !user) {
    console.error('[addSavedRouteAction] Auth error:', authError);
    return { success: false, error: 'Usuario no autenticado.' };
  }
  console.log(`[addSavedRouteAction] Authenticated user: ${user.id}`);

  const validatedData = SavedRouteSchemaForDB.safeParse(routeData);
  if (!validatedData.success) {
    const errorMessage = validatedData.error.flatten().fieldErrors_messages.join(', ');
    console.error('[addSavedRouteAction] Validation failed:', errorMessage, validatedData.error.issues);
    return { success: false, error: errorMessage, errorDetails: validatedData.error.flatten() };
  }
  console.log('[addSavedRouteAction] Validation successful. Validated data:', validatedData.data);

  const dataToInsert = {
    passenger_id: user.id,
    origin: validatedData.data.origin,
    destination: validatedData.data.destination,
    preferred_date: validatedData.data.preferred_date, // Puede ser null
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
      // Check for RLS violation explicitly
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
      .eq('passenger_id', user.id); // Asegura que el usuario solo borre sus propias rutas

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
