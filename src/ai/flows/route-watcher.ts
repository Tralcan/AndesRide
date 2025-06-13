
// src/ai/flows/route-watcher.ts
'use server';
/**
 * @fileOverview Un agente de IA para vigilar rutas que notifica a los usuarios cuando los viajes coinciden con sus rutas guardadas.
 *
 * - watchRoute - La función principal del flujo que maneja la vigilancia de rutas.
 * - WatchRouteInput - El tipo de entrada para la función watchRoute (importado).
 * - WatchRouteOutput - El tipo de retorno para la función watchRoute (importado).
 */

import { ai } from '@/ai/genkit';
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
} from './route-watcher-types'; // Importar desde el nuevo archivo

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

// Esta función auxiliar NO se exporta
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

const prompt = ai.definePrompt({
  name: 'watchRoutePrompt',
  input: {schema: WatchRoutePromptInputSchema},
  output: {schema: WatchRouteLLMOutputSchema },
  prompt: `Eres un vigilante de rutas inteligente para la aplicación ${APP_NAME}.
Tu tarea principal es determinar si hay viajes publicados que coincidan con la ruta guardada de un pasajero y preparar una notificación si es así.

Información de la ruta guardada por el pasajero:
- Correo del Pasajero: {{{passengerEmail}}}
- Origen Preferido: {{{origin}}}
- Destino Preferido: {{{destination}}}
- Fecha Preferida: {{{date}}} (Formato YYYY-MM-DD)

Viajes Publicados Coincidentes (string JSON con objetos PublishedTripDetails):
{{{matchingTripsJson}}}
Cada objeto PublishedTripDetails incluye 'departureDateTime' como una cadena ISO UTC (ej: "2025-06-30T14:00:00.000Z").

RESPONDE ÚNICAMENTE EN FORMATO JSON. Tu respuesta DEBE seguir la siguiente estructura Zod:
{{outputSchema}}

Basado en la información anterior, sigue este PROCESO DE DECISIÓN OBLIGATORIO:

1.  **Análisis de Coincidencia:**
    *   Analiza el string JSON en 'matchingTripsJson'.
    *   Si 'matchingTripsJson' está vacío, representa un array vacío (ej: "[]"), o no contiene viajes válidos, significa que NO se encontraron viajes publicados que coincidan.
    *   Si se encuentran uno o más viajes válidos, selecciona el PRIMER viaje del array como la coincidencia principal.

2.  **Generación de Salida JSON:**
    *   **Si NO se encontró coincidencia:**
        *   Establece el campo 'routeMatchFound' en \`false\`.
        *   En el campo 'message', indica claramente que no se encontraron viajes para la ruta. Ejemplo: "No se encontraron viajes para tu ruta de {{{origin}}} a {{{destination}}} en la fecha {{{date}}}. Seguiremos vigilando."
        *   OMITE los campos 'emailSubject' y 'emailMessage' de tu respuesta JSON (o déjalos como \`undefined\`).
    *   **Si SÍ se encontró coincidencia (usa el primer viaje del JSON para los detalles):**
        *   Establece el campo 'routeMatchFound' en \`true\`.
        *   En el campo 'message', resume la acción. Ejemplo: "¡Coincidencia encontrada y notificación preparada para el viaje de {{{origin}}} a {{{destination}}} el {{{date}}}!".
        *   **Para el campo 'emailSubject':**
            *   Genera un asunto BREVE y PROFESIONAL para el correo de notificación.
            *   DEBE tener entre 10 y 70 caracteres MÁXIMO.
            *   NO USAR emojis.
            *   Ejemplo: "¡Viaje Encontrado! {{{origin}}} - {{{destination}}}".
        *   **Para el campo 'emailMessage':**
            *   Genera el CUERPO COMPLETO del correo electrónico. Este campo es OBLIGATORIO si 'routeMatchFound' es true.
            *   El mensaje DEBE ser amigable e incluir:
                *   Saludo al pasajero (ej: "Hola,").
                *   Confirmación del viaje encontrado: De {{{origin}}} a {{{destination}}} para el {{{date}}}.
                *   Detalles específicos del viaje (del PRIMER viaje en 'matchingTripsJson'):
                    *   Fecha y Hora Programada: (Toma el valor del campo 'departureDateTime' del viaje en 'matchingTripsJson', que es una cadena ISO UTC como "2025-06-30T14:00:00.000Z". Formatea esta fecha y hora en el correo de la siguiente manera: "DD de Mes de AAAA a las HH:mm (UTC)". Por ejemplo, si 'departureDateTime' es "2025-06-30T14:00:00.000Z", el correo debe decir "30 de junio de 2025 a las 14:00 (UTC)").
                    *   Nombre del conductor: (usa el campo 'driverFullName' del JSON).
                    *   Correo del conductor: (usa el campo 'driverEmail' del JSON, si está disponible y no es null; si es null, omite esta línea o indica "no disponible").
                    *   Asientos disponibles: (usa el campo 'seatsAvailable' del JSON).
                *   Llamado a la acción: "Revisa los detalles y reserva tu asiento en ${APP_NAME}."
                *   Despedida cordial (ej: "Atentamente, el equipo de ${APP_NAME}").
            *   El mensaje debe ser claro, conciso y formateado para fácil lectura en un email. NO USAR emojis.

Recuerda: La salida debe ser SIEMPRE un objeto JSON válido que cumpla estrictamente con el schema definido en {{outputSchema}}.
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
    name: 'watchRouteFlowInternal',
    inputSchema: WatchRouteInputSchema,
    outputSchema: WatchRouteLLMOutputSchema,
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
    
    // Limpieza de emojis y longitud del asunto
    const emojiRegex = /([\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])/gu;
    
    const textPart = cleanedSubject.replace(emojiRegex, '').trim();
    // Conserva solo el primer emoji si existe en el original, y si el LLM lo puso
    const firstOriginalEmoji = (llmResult.emailSubject.match(emojiRegex) || []).slice(0, 1).join('');

    cleanedSubject = (firstOriginalEmoji + (firstOriginalEmoji && textPart ? ' ' : '') + textPart).trim();
    cleanedSubject = cleanedSubject.replace(/\s+/g, ' '); 

    if (cleanedSubject.length > 70) {
        cleanedSubject = cleanedSubject.substring(0, 67) + "...";
    }
    if (cleanedSubject.length === 0 && llmResult.emailSubject.length > 0) { 
        cleanedSubject = `¡Viaje Encontrado! ${input.origin} a ${input.destination}`; 
    }
    
    console.log(`[watchRoute] LLM generó contenido de correo. Asunto (limpio): "${cleanedSubject}", Cuerpo (inicio): "${llmResult.emailMessage.substring(0, 100)}..."`);
    notificationSent = await sendNotification(
      input.passengerEmail,
      cleanedSubject,
      llmResult.emailMessage
    );
    console.log(`[watchRoute] Resultado de sendNotification: ${notificationSent}`);
  } else if (llmResult.routeMatchFound) {
    console.warn("[watchRoute] Coincidencia de ruta encontrada, pero el LLM no generó emailSubject y/o emailMessage. No se enviará notificación.");
    if (!llmResult.emailSubject) console.warn("[watchRoute] Causa: emailSubject falta o es vacío.");
    if (!llmResult.emailMessage) console.warn("[watchRoute] Causa: emailMessage falta o es vacío.");
  } else {
    console.log("[watchRoute] No se encontró coincidencia de ruta según el LLM. No se enviará correo.");
  }

  return {
    routeMatchFound: llmResult.routeMatchFound,
    notificationSent: notificationSent,
    message: llmResult.message,
    emailContent: (llmResult.routeMatchFound && llmResult.emailSubject && llmResult.emailMessage) 
      ? { subject: llmResult.emailSubject, body: llmResult.emailMessage } 
      : undefined
  };
}

export type { WatchRouteInput, WatchRouteOutput };

