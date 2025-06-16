// src/ai/flows/route-watcher-types.ts
import { z } from 'zod';

export const WatchRouteInputSchema = z.object({
  passengerEmail: z.string().email().describe('La dirección de correo electrónico del pasajero.'),
  origin: z.string().describe('La ubicación de origen deseada para la ruta.'),
  destination: z.string().describe('La ubicación de destino deseada para la ruta.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "La fecha debe estar en formato YYYY-MM-DD." }).describe('La fecha deseada para la ruta (AAAA-MM-DD). Este campo representa la fecha preferida del pasajero para su ruta guardada y es la fecha exacta que se debe usar para buscar viajes coincidentes.'),
});
export type WatchRouteInput = z.infer<typeof WatchRouteInputSchema>;

// Schema para el input del prompt del LLM
// Contiene los detalles del *primer* viaje encontrado, si lo hay.
export const WatchRoutePromptInputSchema = z.object({
    passengerEmail: z.string().email().describe('La dirección de correo electrónico del pasajero.'),
    origin: z.string().describe('La ubicación de origen deseada para la ruta del pasajero.'),
    destination: z.string().describe('La ubicación de destino deseada para la ruta del pasajero.'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('La fecha deseada para la ruta del pasajero (AAAA-MM-DD).'),
    
    // Detalles del primer viaje encontrado. Opcionales si no hay coincidencia.
    tripFound: z.boolean().describe('Indica si se encontró un viaje coincidente.'),
    tripOrigin: z.string().optional().describe('Origen del viaje encontrado.'),
    tripDestination: z.string().optional().describe('Destino del viaje encontrado.'),
    // Este campo YA ESTARÁ FORMATEADO como "dd de MMMM de yyyy a las HH:mm hrs (UTC)" desde actions.ts
    tripDepartureDateTime: z.string().optional().describe('Fecha y hora de salida del viaje encontrado, ya formateada y en UTC.'),
    // Este campo YA ESTARÁ FORMATEADO como "dd de MMMM de yyyy" desde actions.ts
    tripDepartureDateFormatted: z.string().optional().describe('Fecha de salida del viaje encontrado (formato dd de MMMM de yyyy), para el asunto del correo.'),
    tripDriverFullName: z.string().optional().describe('Nombre completo del conductor del viaje encontrado.'),
    tripSeatsAvailable: z.number().optional().describe('Asientos disponibles en el viaje encontrado.'),
});
export type WatchRoutePromptInput = z.infer<typeof WatchRoutePromptInputSchema>;


// Schema para la salida esperada del LLM - SIMPLIFICADO
export const WatchRouteLLMOutputSchema = z.object({
  routeMatchFound: z.boolean().describe('Si se encontró una ruta coincidente REAL Y PUBLICADA.'),
  message: z.string().describe('Un mensaje breve que indica el resultado de la vigilancia de la ruta (ej. "Coincidencia encontrada!" o "No se encontraron viajes.").'),
  emailSubject: z.string().optional().describe('El asunto del correo electrónico a enviar, si se encontró una coincidencia. Debe ser breve, profesional, conciso, y no exceder los 70 caracteres. NO USAR emojis. NO REPETIR TEXTO.'),
});
export type WatchRouteLLMOutput = z.infer<typeof WatchRouteLLMOutputSchema>;


// Interfaz para la salida final de la función `watchRoute` exportada
export interface WatchRouteOutput {
    routeMatchFound: boolean;
    notificationSent: boolean;
    message: string; // Mensaje para la UI, puede ser el del LLM o uno genérico si el LLM falla
    emailContent?: { subject: string; body: string }; // Para debugging o pruebas
}
