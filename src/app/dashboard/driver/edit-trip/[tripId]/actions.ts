
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
    // 1. Verify trip ownership and get current passenger requests to know if any need cancellation.
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
    
    const passengerRequests = existingTripData.trip_requests || [];
    const activePassengerRequestsExist = passengerRequests.some(
      (req: { status: string }) => req.status === 'pending' || req.status === 'confirmed'
    );

    // 2. Update the trip
    // The formData.seats_available is the new total number of seats the driver wants to offer.
    // Existing 'pending' or 'confirmed' requests will be cancelled below, effectively freeing up those seats.
    // So, the value from the form is the final intended value for seats_available.
    const { error: updateTripError } = await supabase
      .from('trips')
      .update({
        origin: formData.origin,
        destination: formData.destination,
        departure_datetime: formData.departure_datetime,
        seats_available: formData.seats_available, // Use the direct value from the form
        updated_at: new Date().toISOString(), // Explicitly set updated_at for the trip
      })
      .eq('id', tripId);

    if (updateTripError) {
      console.error('[updateTripAction] Error updating trip:', updateTripError);
      return { success: false, message: `Error al actualizar el viaje: ${updateTripError.message}` };
    }

    // 3. Cancel 'pending' and 'confirmed' passenger requests for this trip
    //    Mark them as 'cancelled_trip_modified'
    if (activePassengerRequestsExist) {
      console.log(`[updateTripAction] Active passenger requests exist for trip ${tripId}. Attempting to cancel them.`);
      const { error: updateRequestsError, count: updatedRequestsCount } = await supabase
        .from('trip_requests')
        .update({ status: 'cancelled_trip_modified', updated_at: new Date().toISOString() })
        .eq('trip_id', tripId)
        .in('status', ['pending', 'confirmed'])
        .select(); // Adding select to get count or details for debugging if needed

      if (updateRequestsError) {
        console.error('[updateTripAction] Error cancelling passenger requests after trip edit:', updateRequestsError);
        // Trip update was successful, but passenger cancellations failed.
        // Return a message indicating partial success or specific error.
        revalidateRelevantPaths(tripId); // Revalidate even if this part fails, as trip data changed.
        return { success: true, message: `Viaje actualizado. Sin embargo, ocurrió un error al cancelar las solicitudes de pasajeros existentes: ${updateRequestsError.message}` };
      }
      console.log(`[updateTripAction] Successfully cancelled ${updatedRequestsCount ?? 'unknown number of'} active passenger requests for trip ${tripId}.`);
    } else {
      console.log(`[updateTripAction] No active passenger requests found for trip ${tripId} to cancel.`);
    }
    
    revalidateRelevantPaths(tripId);
    return { success: true, message: 'Viaje actualizado exitosamente. Las solicitudes de pasajeros activas (pendientes o confirmadas) para este viaje han sido canceladas. Los pasajeros necesitarán volver a solicitar si aún están interesados.' };

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

