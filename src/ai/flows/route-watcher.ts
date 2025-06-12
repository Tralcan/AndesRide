'use server';
/**
 * @fileOverview Un agente de IA para vigilar rutas que notifica a los usuarios cuando los viajes coinciden con sus rutas guardadas.
 *
 * - watchRoute - La función principal del flujo que maneja la vigilancia de rutas.
 * - WatchRouteInput - El tipo de entrada para la función watchRoute (importado de ./route-watcher-types).
 * - WatchRouteOutput - El tipo de retorno para la función watchRoute (importado de ./route-watcher-types).
 */

import {ai} from '@/ai/genkit';
import { findPublishedMatchingTripsAction, type PublishedTripDetails, type FindPublishedMatchingTripsInput } from '@/app/dashboard/passenger/saved-routes/actions';
import { Resend } from 'resend';
import { APP_NAME } from '@/lib/constants';
import { 
  WatchRouteInputSchema, 
  type WatchRouteInput, 
  WatchRouteLLMOutputSchema, 
  type WatchRouteLLMOutput,
  WatchRoutePromptInputSchema,
  type WatchRoutePromptInput,
  type WatchRouteOutput
} from './route-watcher-types';

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
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log(`[sendNotification FUNCTION] INVOCADA CON: Email: ${passengerEmail}, Subject: "${subject}", Message (primeros 100 chars): "${message.substring(0,100)}..."`);
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');

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
  console.log(`[sendNotification FUNCTION] Intentando enviar email. De: ${APP_NAME} <onboarding@resend.dev>, Para: ${passengerEmail}, Asunto: "${subject}"`);

  try {
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <onboarding@resend.dev>`,
      to: [passengerEmail],
      subject: subject,
      html: `<p>${message.replace(/\n/g, '<br>')}</p>`, // Simple HTML formatting
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

const prompt = ai.definePrompt({
  name: 'watchRoutePrompt',
  input: {schema: WatchRoutePromptInputSchema},
  output: {schema: WatchRouteLLMOutputSchema }, 
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
      iii. NO generes 'emailSubject' ni 'emailMessage'. Estos campos deben omitirse.
  3.  Si 'matchingTripsJson' representa un array con UNO O MÁS viajes publicados:
      a.  Selecciona el PRIMER viaje del array como la coincidencia principal.
      b.  Establece 'routeMatchFound' en true.
      c.  En el campo 'message' del output, resume la acción (ej: "¡Coincidencia encontrada! Se encontró un viaje de {{{origin}}} a {{{destination}}} para el {{{date}}}. Se procederá a notificar.").
      d.  Genera un 'emailSubject' para el correo de notificación. Debe ser breve, conciso, profesional, no exceder los 70 caracteres y NO USAR emojis. Ejemplo: "¡Viaje Encontrado! {{{origin}}} - {{{destination}}}".
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
          - El mensaje debe ser claro, conciso y formateado para fácil lectura en un email. No incluyas emojis en el cuerpo del mensaje.

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
    name: 'watchRouteFlowInternal', // Renombrado para evitar confusión
    inputSchema: WatchRouteInputSchema,
    outputSchema: WatchRouteLLMOutputSchema, // El flow ahora devuelve lo que el LLM genera
  },
  async (input: WatchRouteInput): Promise<WatchRouteLLMOutput> => {
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
    }
    
    const matchingTripsJson = JSON.stringify(matchingTrips);
    console.log('[watchRouteFlow] String JSON de viajes coincidentes para el LLM:', matchingTripsJson);

    const promptInput: WatchRoutePromptInput = { 
        ...input,
        matchingTripsJson: matchingTripsJson,
    };

    console.log('[watchRouteFlow] Input para el prompt del LLM (incluyendo matchingTripsJson):', JSON.stringify(promptInput, null, 2));
    
    const { output: llmOutput } = await prompt(promptInput);

    console.log('[watchRouteFlow] Output del LLM (WatchRouteLLMOutputSchema):', JSON.stringify(llmOutput, null, 2));

    if (!llmOutput) {
      console.error('[watchRouteFlow] No se recibió una respuesta estructurada del LLM.');
      return {
        routeMatchFound: false,
        message: `Error: No se recibió una respuesta estructurada del LLM para la ruta de ${input.origin} a ${input.destination}.`,
      };
    }
    
    return llmOutput;
  }
);

// Exportar la función principal que llama al flujo y luego maneja la notificación
export async function watchRoute(input: WatchRouteInput): Promise<WatchRouteOutput> {
  console.log('[watchRoute] Invoking watchRouteFlow with input:', JSON.stringify(input, null, 2));
  const llmResult = await watchRouteFlow(input); 
  console.log('[watchRoute] LLM Result:', JSON.stringify(llmResult, null, 2));

  let notificationSent = false;
  if (llmResult.routeMatchFound && llmResult.emailSubject && llmResult.emailMessage) {
    let cleanedSubject = llmResult.emailSubject;
    
    // Limpieza de emojis más robusta y limitación de longitud
    const emojiRegex = /([\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])/gu;
    const textPart = cleanedSubject.replace(emojiRegex, '').trim();
    const emojis = (cleanedSubject.match(emojiRegex) || []).slice(0, 1).join(''); // Conserva solo el primer emoji si existe

    cleanedSubject = (emojis + (emojis && textPart ? ' ' : '') + textPart).trim();
    cleanedSubject = cleanedSubject.replace(/\s+/g, ' '); // Normalizar espacios

    if (cleanedSubject.length > 70) {
        cleanedSubject = cleanedSubject.substring(0, 67) + "...";
    }
    if (cleanedSubject.length === 0 && llmResult.emailSubject.length > 0) { // Si el original tenía emojis y ahora está vacío
        cleanedSubject = `¡Viaje Encontrado! ${input.origin} a ${input.destination}`; // Fallback más genérico si la limpieza lo deja vacío
    }
    
    console.log(`[watchRoute] LLM generó contenido de correo. Asunto (limpio): "${cleanedSubject}", Cuerpo (inicio): "${llmResult.emailMessage.substring(0, 100)}..."`);
    notificationSent = await sendNotification(
      input.passengerEmail,
      cleanedSubject,
      llmResult.emailMessage
    );
    console.log(`[watchRoute] Resultado de sendNotification: ${notificationSent}`);
  } else if (llmResult.routeMatchFound) {
    console.warn("[watchRoute] Coincidencia de ruta encontrada, pero el LLM no generó emailSubject o emailMessage. No se enviará notificación.");
  } else {
    console.log("[watchRoute] No se encontró coincidencia de ruta según el LLM. No se enviará correo.");
  }

  return {
    routeMatchFound: llmResult.routeMatchFound,
    notificationSent: notificationSent,
    message: llmResult.message,
    emailContent: (llmResult.emailSubject && llmResult.emailMessage) ? { subject: llmResult.emailSubject, body: llmResult.emailMessage } : undefined
  };
}
