'use server';
/**
 * @fileOverview Un agente de IA para vigilar rutas que notifica a los usuarios cuando los viajes coinciden con sus rutas guardadas.
 *
 * - watchRoute - Una función que maneja el proceso de vigilancia de rutas.
 * - WatchRouteInput - El tipo de entrada para la función watchRoute.
 * - WatchRouteOutput - El tipo de retorno para la función watchRoute.
 */

import {ai} from '@/ai/genkit';
import {z}  from 'genkit';
import { findPublishedMatchingTripsAction, type FindPublishedMatchingTripsInput, type PublishedTripDetails } from '@/app/dashboard/passenger/saved-routes/actions';
import { Resend } from 'resend';
import { APP_NAME } from '@/lib/constants';

const WatchRouteInputSchema = z.object({
  passengerEmail: z.string().email().describe('La dirección de correo electrónico del pasajero.'),
  origin: z.string().describe('La ubicación de origen deseada para la ruta.'),
  destination: z.string().describe('La ubicación de destino deseada para la ruta.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('La fecha deseada para la ruta (AAAA-MM-DD). Este campo representa la fecha preferida del pasajero para su ruta guardada y es la fecha exacta que se debe usar para buscar viajes coincidentes.'),
});
export type WatchRouteInput = z.infer<typeof WatchRouteInputSchema>;

const WatchRouteLLMOutputSchema = z.object({
  routeMatchFound: z.boolean().describe('Si se encontró una ruta coincidente REAL Y PUBLICADA.'),
  message: z.string().describe('Un mensaje que indica el resultado de la vigilancia de la ruta.'),
  emailSubject: z.string().optional().describe('El asunto del correo electrónico a enviar, si se encontró una coincidencia. Debe ser breve, profesional y conciso.'),
  emailMessage: z.string().optional().describe('El cuerpo del mensaje del correo electrónico a enviar, si se encontró una coincidencia. Debe incluir los detalles del viaje y un saludo amigable.'),
});
// No exportamos el schema del LLM directamente.

export interface WatchRouteOutput {
    routeMatchFound: boolean;
    notificationSent: boolean;
    message: string;
}

const resendApiKey = process.env.RESEND_API_KEY;
let resend: Resend | null = null;

if (resendApiKey) {
  console.log('[route-watcher] RESEND_API_KEY está configurada.');
  try {
    resend = new Resend(resendApiKey);
    console.log('[route-watcher] Resend client inicializado correctamente.');
  } catch (error) {
    console.error('[route-watcher] Error al inicializar Resend client:', error);
  }
} else {
  console.warn('[route-watcher] RESEND_API_KEY no está configurada. Las notificaciones por email no funcionarán.');
}

async function sendNotification(
    passengerEmail: string,
    subject: string,
    message: string
): Promise<boolean> {
  console.log('*******************************************************************************************************');
  console.log(`[sendNotification FUNCTION] INVOCADA CON: Email: ${passengerEmail}, Subject: "${subject}", Message (primeros 100 chars): "${message.substring(0,100)}..."`);
  console.log('*******************************************************************************************************');

  if (!resend) {
    console.error('[sendNotification FUNCTION] Resend client no está inicializado. No se puede enviar el email. Verifica la RESEND_API_KEY.');
    return false;
  }
  console.log('[sendNotification FUNCTION] Resend client está inicializado.');

  if (!APP_NAME) {
    console.error("[sendNotification FUNCTION] APP_NAME no está definido. No se puede enviar el email.");
    return false;
  }
  console.log(`[sendNotification FUNCTION] APP_NAME es: ${APP_NAME}`);

  if (!passengerEmail || !subject || !message) {
    console.error(`[sendNotification FUNCTION] Faltan campos requeridos. Recibido: passengerEmail=${passengerEmail}, subject=${subject}, message (longitud)=${message?.length}. No se puede enviar el email.`);
    return false;
  }
  console.log(`[sendNotification FUNCTION] Todos los campos requeridos (passengerEmail, subject, message) están presentes.`);

  try {
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <onboarding@resend.dev>`, // Cambia esto por tu dominio verificado en producción
      to: [passengerEmail],
      subject: subject,
      html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
      text: message,
    });

    if (error) {
      console.error('[sendNotification FUNCTION] Error al enviar email con Resend:', JSON.stringify(error, null, 2));
      return false;
    }
    console.log('[sendNotification FUNCTION] Email enviado exitosamente. ID:', data?.id);
    return true;
  } catch (e: any) {
    console.error('[sendNotification FUNCTION] Excepción al enviar email:', JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
    return false;
  }
}

export async function watchRoute(input: WatchRouteInput): Promise<WatchRouteOutput> {
  console.log('[watchRoute] INICIO. Input:', JSON.stringify(input, null, 2));
  try {
    const result = await watchRouteFlow(input);
    console.log('[watchRoute] FIN. Resultado:', JSON.stringify(result, null, 2));
    return result;
  } catch (error: any) {
    console.error('[watchRoute] ERROR EN EL FLUJO:', error);
    // Asegurarse de que siempre se devuelva un objeto WatchRouteOutput válido
    return {
      routeMatchFound: false,
      notificationSent: false,
      message: `Error procesando la vigilancia de ruta: ${error.message || 'Error desconocido en watchRoute'}.`,
    };
  }
}

const WatchRoutePromptInputSchema = WatchRouteInputSchema.extend({
    matchingTripsJson: z.string().describe('Un string JSON que representa un array de objetos PublishedTripDetails. Cada objeto describe un viaje publicado que coincide con el origen, destino y fecha. Si no se encontraron viajes, será un string JSON de un array vacío "[]".')
});

const prompt = ai.definePrompt({
  name: 'watchRoutePrompt',
  input: {schema: WatchRoutePromptInputSchema},
  output: {schema: WatchRouteLLMOutputSchema},
  prompt: `Eres un vigilante de rutas inteligente para la aplicación ${APP_NAME}. Tu tarea es analizar una lista de viajes (proporcionada como un string JSON en 'matchingTripsJson') que ya han sido buscados y coinciden con el origen, destino y fecha de la ruta guardada de un pasajero.

  Información de la ruta guardada por el pasajero:
  - Correo del Pasajero: {{{passengerEmail}}}
  - Origen Preferido: {{{origin}}}
  - Destino Preferido: {{{destination}}}
  - Fecha Preferida: {{{date}}} (Formato YYYY-MM-DD)

  Viajes Encontrados (string JSON con detalles de viajes publicados):
  {{{matchingTripsJson}}}

  Proceso de Decisión OBLIGATORIO:
  1.  Analiza el string JSON en 'matchingTripsJson'.
  2.  Si 'matchingTripsJson' está vacío o representa un array vacío (ej: "[]"), significa que NO se encontraron viajes publicados que coincidan. En este caso:
      i.  Establece 'routeMatchFound' en false.
      ii. En el campo 'message' del output, indica claramente que no se encontraron viajes publicados para la ruta (Origen: {{{origin}}}, Destino: {{{destination}}}, Fecha: {{{date}}}). Ejemplo: "No se encontraron viajes publicados para tu ruta de {{{origin}}} a {{{destination}}} en la fecha {{{date}}}. Seguiremos vigilando."
      iii. NO generes 'emailSubject' ni 'emailMessage'.
  3.  Si 'matchingTripsJson' representa un array con UNO O MÁS viajes publicados:
      a.  Selecciona el PRIMER viaje del array como la coincidencia principal.
      b.  Establece 'routeMatchFound' en true.
      c.  En el campo 'message' del output, resume la acción (ej: "¡Coincidencia encontrada! Se encontró un viaje de {{{origin}}} a {{{destination}}} para el {{{date}}}. Se procederá a notificar.").
      d.  Genera un 'emailSubject' para el correo de notificación. Debe ser breve, conciso y profesional, sin emojis excesivos y con un máximo de 70 caracteres. Ejemplo: "¡Viaje Encontrado! {{{origin}}} - {{{destination}}}".
      e.  Genera un 'emailMessage' para el cuerpo del correo. El mensaje DEBE ser amigable e incluir:
          - Saludo al pasajero (usa "Hola," o "Estimado/a pasajero/a,").
          - Confirmación de que se encontró un viaje para su ruta: {{{origin}}} a {{{destination}}} en la fecha {{{date}}}.
          - Detalles del viaje encontrado (del primer viaje en 'matchingTripsJson'):
              - Hora de salida: (usa el campo 'departureDateTime' del viaje).
              - Nombre del conductor: (usa el campo 'driverFullName').
              - Correo electrónico del conductor: (usa el campo 'driverEmail'), si está disponible y no es null. Si es null, omite esta línea.
              - Asientos disponibles: (usa el campo 'seatsAvailable').
          - Un llamado a la acción claro, por ejemplo: "Revisa los detalles y reserva tu asiento en ${APP_NAME}."
          - Una despedida cordial (ej. "Saludos," o "Atentamente,").
          - El mensaje debe ser claro, conciso y formateado para fácil lectura en un email. No incluyas emojis.

  Asegúrate de que la salida sea un objeto JSON válido que cumpla con WatchRouteLLMOutputSchema. No incluyas campos adicionales. Si no hay coincidencia, 'emailSubject' y 'emailMessage' deben estar ausentes u omitidos, no con valores vacíos o nulos.
`,
  config: {
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
    ],
  },
});

const watchRouteFlow = ai.defineFlow(
  {
    name: 'watchRouteFlow',
    inputSchema: WatchRouteInputSchema,
    outputSchema: WatchRouteOutputSchema, 
  },
  async (input): Promise<WatchRouteOutput> => {
    console.log('[watchRouteFlow] Flow iniciado con input:', JSON.stringify(input, null, 2));

    const searchInput: FindPublishedMatchingTripsInput = {
        origin: input.origin,
        destination: input.destination,
        searchDate: input.date,
    };
    console.log('[watchRouteFlow] Llamando a findPublishedMatchingTripsAction con input:', JSON.stringify(searchInput, null, 2));
    let matchingTrips: PublishedTripDetails[] = [];
    try {
        matchingTrips = await findPublishedMatchingTripsAction(searchInput);
        console.log(`[watchRouteFlow] findPublishedMatchingTripsAction devolvió ${matchingTrips.length} viaje(s).`);
        if (matchingTrips.length > 0) {
            console.log('[watchRouteFlow] Detalles del primer viaje encontrado:', JSON.stringify(matchingTrips[0], null, 2));
        }
    } catch (error: any) {
        console.error('[watchRouteFlow] Error al llamar a findPublishedMatchingTripsAction:', error.message ? error.message : JSON.stringify(error));
        return {
          routeMatchFound: false,
          notificationSent: false,
          message: `Error al buscar viajes coincidentes: ${error.message}`,
        };
    }
    
    const matchingTripsJson = JSON.stringify(matchingTrips);
    console.log('[watchRouteFlow] String JSON de viajes coincidentes para el LLM:', matchingTripsJson);

    const promptInput = {
        ...input,
        matchingTripsJson: matchingTripsJson,
    };

    console.log('[watchRouteFlow] Input para el prompt del LLM (incluyendo matchingTripsJson):', JSON.stringify(promptInput, null, 2));

    const {output: llmOutput} = await prompt(promptInput);

    console.log('[watchRouteFlow] Output del LLM (WatchRouteLLMOutputSchema):', JSON.stringify(llmOutput, null, 2));

    if (!llmOutput) {
      console.error('[watchRouteFlow] No se recibió una respuesta estructurada del LLM.');
      return {
        routeMatchFound: false,
        notificationSent: false, 
        message: `Error: No se recibió una respuesta estructurada del LLM para la ruta de ${input.origin} a ${input.destination}.`,
      };
    }

    let notificationWasSent = false;
    if (llmOutput.routeMatchFound && llmOutput.emailSubject && llmOutput.emailMessage) {
      console.log(`[watchRouteFlow] Coincidencia encontrada por LLM. Procediendo a llamar a sendNotification. Subject: "${llmOutput.emailSubject}", Message snippet: "${llmOutput.emailMessage.substring(0, 100)}..."`);
      notificationWasSent = await sendNotification(
        input.passengerEmail,
        llmOutput.emailSubject,
        llmOutput.emailMessage
      );
      console.log(`[watchRouteFlow] Resultado de sendNotification: ${notificationWasSent}`);
    } else if (llmOutput.routeMatchFound && (!llmOutput.emailSubject || !llmOutput.emailMessage)) {
        console.warn("[watchRouteFlow] LLM reportó routeMatchFound=true pero no generó emailSubject o emailMessage. No se intentará la notificación. LLM Output:", JSON.stringify(llmOutput, null, 2));
    } else {
        console.log("[watchRouteFlow] No se encontró coincidencia de ruta según el LLM o faltan detalles para la notificación. No se enviará correo.");
    }
    
    const finalOutput: WatchRouteOutput = {
        routeMatchFound: llmOutput.routeMatchFound,
        notificationSent: notificationWasSent,
        message: llmOutput.message,
    };
    
    console.log('[watchRouteFlow] Output final del flujo (WatchRouteOutput):', JSON.stringify(finalOutput, null, 2));
    return finalOutput;
  }
);

