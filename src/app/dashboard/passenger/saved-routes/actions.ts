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
    return { success: false, error: 'Usuario no autenticado.' };
  }

  try {
    const { data, error } = await supabase
      .from('saved_routes')
      .select('*')
      .eq('passenger_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[getSavedRoutesAction] Error fetching saved routes:', error);
      return { success: false, error: error.message };
    }
    return { success: true, routes: data || [] };
  } catch (e: any) {
    console.error('[getSavedRoutesAction] Exception:', e);
    return { success: false, error: e.message || 'Error inesperado al obtener rutas guardadas.' };
  }
}

export async function addSavedRouteAction(
  routeData: z.infer<typeof SavedRouteSchemaForDB>
): Promise<{ success: boolean; route?: SavedRouteFromDB; error?: string }> {
  const supabase = createServerActionClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'Usuario no autenticado.' };
  }

  const validatedData = SavedRouteSchemaForDB.safeParse(routeData);
  if (!validatedData.success) {
    return { success: false, error: validatedData.error.flatten().fieldErrors_messages.join(', ') };
  }

  try {
    const { data: newRoute, error } = await supabase
      .from('saved_routes')
      .insert({
        passenger_id: user.id,
        origin: validatedData.data.origin,
        destination: validatedData.data.destination,
        preferred_date: validatedData.data.preferred_date, // Puede ser null
      })
      .select()
      .single();

    if (error) {
      console.error('[addSavedRouteAction] Error inserting saved route:', error);
      return { success: false, error: error.message };
    }
    
    revalidatePath('/dashboard/passenger/saved-routes');
    return { success: true, route: newRoute };
  } catch (e: any) {
    console.error('[addSavedRouteAction] Exception:', e);
    return { success: false, error: e.message || 'Error inesperado al guardar la ruta.' };
  }
}

export async function deleteSavedRouteAction(routeId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerActionClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'Usuario no autenticado.' };
  }

  try {
    const { error } = await supabase
      .from('saved_routes')
      .delete()
      .eq('id', routeId)
      .eq('passenger_id', user.id); // Asegura que el usuario solo borre sus propias rutas

    if (error) {
      console.error('[deleteSavedRouteAction] Error deleting saved route:', error);
      return { success: false, error: error.message };
    }
    
    revalidatePath('/dashboard/passenger/saved-routes');
    return { success: true };
  } catch (e: any) {
    console.error('[deleteSavedRouteAction] Exception:', e);
    return { success: false, error: e.message || 'Error inesperado al eliminar la ruta.' };
  }
}
