
// src/app/dashboard/driver/manage-trips/actions.ts
'use server';
import { createServerActionClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function deleteTripAndCancelRequestsAction(tripId: string): Promise<{ success: boolean; message: string }> {
  const supabase = createServerActionClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, message: 'Usuario no autenticado.' };
  }

  try {
    // 1. Verify the trip belongs to the user (optional, RLS on delete should handle this, but good for clear error)
    const { data: tripData, error: tripFetchError } = await supabase
      .from('trips')
      .select('id, driver_id')
      .eq('id', tripId)
      .single();

    if (tripFetchError || !tripData) {
      return { success: false, message: 'Viaje no encontrado o error al verificar.' };
    }
    if (tripData.driver_id !== user.id) {
      return { success: false, message: 'No tienes permiso para eliminar este viaje.' };
    }

    // 2. Update associated passenger requests to 'cancelled_by_driver'
    //    Only cancel 'pending' or 'confirmed' requests.
    const { error: updateRequestsError } = await supabase
      .from('trip_requests')
      .update({ status: 'cancelled_by_driver', updated_at: new Date().toISOString() })
      .eq('trip_id', tripId)
      .in('status', ['pending', 'confirmed']);

    if (updateRequestsError) {
      console.error('[deleteTripAction] Error cancelling passenger requests:', updateRequestsError);
      // Proceed with trip deletion but inform about this error.
      // Or, decide to stop if this is critical. For now, we log and proceed.
      // A more robust solution might involve transactions if Supabase JS supports them easily for this pattern.
    }

    // 3. Delete the trip
    const { error: deleteTripError } = await supabase
      .from('trips')
      .delete()
      .eq('id', tripId);

    if (deleteTripError) {
      console.error('[deleteTripAction] Error deleting trip:', deleteTripError);
      return { success: false, message: `Error al eliminar el viaje: ${deleteTripError.message}` };
    }

    revalidatePath('/dashboard/driver/manage-trips');
    revalidatePath('/dashboard/driver/passenger-requests');
    revalidatePath('/dashboard/passenger/my-booked-trips'); // Passengers' views might change

    let message = 'Viaje eliminado con éxito.';
    if (updateRequestsError) {
        message += ` Sin embargo, hubo un problema al actualizar el estado de algunas solicitudes de pasajeros: ${updateRequestsError.message}`;
    } else {
        message += ' Las solicitudes de pasajeros asociadas también fueron canceladas.';
    }
    return { success: true, message };

  } catch (error: any) {
    console.error('[deleteTripAction] Error in deleteTripAndCancelRequestsAction:', error);
    return { success: false, message: `Error inesperado: ${error.message}` };
  }
}
