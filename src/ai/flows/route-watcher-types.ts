// src/ai/flows/route-watcher-types.ts
import { z } from 'zod';
import type { PublishedTripDetails } from '@/app/dashboard/passenger/saved-routes/actions';

export const WatchRouteInputSchema = z.object({
  passengerEmail: z.string().email().describe('La dirección de correo electrónico del pasajero.'),
  origin: z.string().describe('La ubicación de origen deseada para la ruta.'),
  destination: z.string().describe('La ubicación de destino deseada para la ruta.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "La fecha debe estar en formato YYYY-MM-DD." }).describe('La fecha deseada para la ruta (AAAA-MM-DD). Este campo representa la fecha preferida del pasajero para su ruta guardada y es la fecha exacta que se debe usar para buscar viajes coincidentes.'),
});
export type WatchRouteInput = z.infer<typeof WatchRouteInputSchema>;

export const WatchRouteLLMOutputSchema = z.object({
  routeMatchFound: z.boolean().describe('Si se encontró una ruta coincidente REAL Y PUBLICADA.'),
  message: z.string().describe('Un mensaje que indica el resultado de la vigilancia de la ruta.'),
  emailSubject: z.string().optional().describe('El asunto del correo electrónico a enviar, si se encontró una coincidencia. Debe ser breve, profesional, conciso, y no exceder los 70 caracteres. NO USAR emojis.'),
  emailMessage: z.string().optional().describe('El cuerpo del mensaje del correo electrónico a enviar, si se encontró una coincidencia. Debe incluir los detalles del viaje y un saludo amigable. No usar emojis.'),
});
export type WatchRouteLLMOutput = z.infer<typeof WatchRouteLLMOutputSchema>;

export const WatchRoutePromptInputSchema = WatchRouteInputSchema.extend({
    matchingTripsJson: z.string().describe('Un string JSON que representa un array de objetos PublishedTripDetails. Cada objeto describe un viaje publicado que coincide con el origen, destino y fecha. Si no se encontraron viajes, será un string JSON de un array vacío "[]".')
});
export type WatchRoutePromptInput = z.infer<typeof WatchRoutePromptInputSchema>;

export interface WatchRouteOutput {
    routeMatchFound: boolean;
    notificationSent: boolean;
    message: string;
    emailContent?: { subject: string; body: string };
}
