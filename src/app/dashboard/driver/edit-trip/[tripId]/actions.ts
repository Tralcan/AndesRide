
// src/app/dashboard/driver/edit-trip/[tripId]/actions.ts
'use server';
import { createServerActionClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface TripFormData {
  origin: string;
  destination: string;
  departure_datetime: string; // ISO string from client (already UTC)
  seats_available: number;
}

export async function updateTripAndHandleRequestsAction(
  tripId: string,
  formData: TripFormData
): Promise<{ success: boolean; message: string }> {
  const supabase = createServerActionClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, message: 'Usuario no autenticado.' };
  }

  try {
    // 1. Verify trip ownership and get current confirmed requests
    const { data: existingTripData, error: fetchError } = await supabase
      .from('trips')
      .select('driver_id, trip_requests(id, status)')
      .eq('id', tripId)
      .single();

    if (fetchError || !existingTripData) {
      console.error('[updateTripAction] Error fetching existing trip or trip not found:', fetchError);
      return { success: false, message: 'Viaje no encontrado o error al verificarlo.' };
    }
    if (existingTripData.driver_id !== user.id) {
      return { success: false, message: 'No tienes permiso para editar este viaje.' };
    }
    
    const confirmedRequests = (existingTripData.trip_requests || []).filter(
      (req: { status: string }) => req.status === 'confirmed'
    );
    const confirmedRequestCount = confirmedRequests.length;

    // 2. Calculate the final number of available seats
    // The formData.seats_available is what the driver WANTS to be newly available.
    // We add back seats from any 'confirmed' bookings that are about to be cancelled.
    const finalSeatsAvailable = formData.seats_available + confirmedRequestCount;

    // 3. Update the trip
    // The `updated_at` field on `trips` table is handled by its own `trigger_set_timestamp`
    const { error: updateTripError } = await supabase
      .from('trips')
      .update({
        origin: formData.origin,
        destination: formData.destination,
        departure_datetime: formData.departure_datetime,
        seats_available: finalSeatsAvailable, // Use the adjusted seat count
      })
      .eq('id', tripId);

    if (updateTripError) {
      console.error('[updateTripAction] Error updating trip:', updateTripError);
      return { success: false, message: `Error al actualizar el viaje: ${updateTripError.message}` };
    }

    // 4. Cancel 'pending' and 'confirmed' passenger requests for this trip
    //    Mark them as 'cancelled_trip_modified'
    if (confirmedRequestCount > 0 || (existingTripData.trip_requests || []).some((req: {status: string}) => req.status === 'pending')) {
      const { error: updateRequestsError } = await supabase
        .from('trip_requests')
        .update({ status: 'cancelled_trip_modified', updated_at: new Date().toISOString() })
        .eq('trip_id', tripId)
        .in('status', ['pending', 'confirmed']);

      if (updateRequestsError) {
        console.error('[updateTripAction] Error cancelling passenger requests after trip edit:', updateRequestsError);
        // Trip update was successful, but passenger cancellations failed.
        // Return a message indicating partial success or specific error.
        revalidateRelevantPaths(tripId); // Revalidate even if this part fails, as trip data changed.
        return { success: true, message: `Viaje actualizado. Sin embargo, ocurrió un error al cancelar las solicitudes de pasajeros existentes: ${updateRequestsError.message}` };
      }
    }
    
    revalidateRelevantPaths(tripId);
    return { success: true, message: 'Viaje actualizado. Las solicitudes de pasajeros activas han sido canceladas; los pasajeros deberán volver a solicitar.' };

  } catch (error: any) {
    console.error('[updateTripAction] Error in updateTripAndHandleRequestsAction:', error);
    return { success: false, message: `Error inesperado: ${error.message}` };
  }
}

function revalidateRelevantPaths(tripId: string) {
    revalidatePath('/dashboard/driver/manage-trips');
    revalidatePath(`/dashboard/driver/edit-trip/${tripId}`);
    revalidatePath('/dashboard/driver/passenger-requests');
    revalidatePath('/dashboard/passenger/my-booked-trips');
}
