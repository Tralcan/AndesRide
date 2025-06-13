
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
  prompt: `Eres un vigilante de rutas para ${APP_NAME}.
Tu tarea es analizar si hay viajes coincidentes y preparar el contenido para una notificación por email.
RESPONDE ÚNICAMENTE EN FORMATO JSON. Tu respuesta DEBE seguir el schema Zod: {{outputSchema}}.
NO REPITAS TEXTO. NO USES emojis. Entrega solo el JSON.

Datos del pasajero:
- Email: {{{passengerEmail}}}
- Origen: {{{origin}}}
- Destino: {{{destination}}}
- Fecha: {{{date}}}

Viajes publicados coincidentes (JSON string):
{{{matchingTripsJson}}}

Proceso:
1.  Si 'matchingTripsJson' está vacío o es "[]", no hay coincidencias.
    -   'routeMatchFound' debe ser \`false\`.
    -   'message' debe indicar que no se encontraron viajes.
    -   OMITE 'emailSubject' y 'emailMessage'.
2.  Si hay coincidencias, usa el PRIMER viaje del JSON.
    -   'routeMatchFound' debe ser \`true\`.
    -   'message' debe resumir la acción.
    -   'emailSubject': Crea un ASUNTO MUY CORTO Y PROFESIONAL (máx. 70 caracteres). Ejemplo: "¡Viaje Encontrado! {{{origin}}} a {{{destination}}}".
    -   'emailMessage': Crea el CUERPO DEL EMAIL. Este campo es OBLIGATORIO si 'routeMatchFound' es true.
        -   Incluye:
            -   Saludo.
            -   Confirmación: Viaje de {{{origin}}} a {{{destination}}} para {{{date}}}.
            -   Detalles del primer viaje en 'matchingTripsJson':
                -   Fecha y Hora Programada: Usa 'departureDateTime' (cadena ISO UTC). Formatea como "DD de Mes de AAAA a las HH:mm (UTC)". Ejemplo: "30 de junio de 2025 a las 14:00 (UTC)".
                -   Conductor: 'driverFullName'.
                -   Email Conductor: 'driverEmail' (si existe).
                -   Asientos: 'seatsAvailable'.
            -   Llamado a la acción: "Revisa y reserva en ${APP_NAME}."
            -   Despedida.

Ejemplo de JSON esperado si hay coincidencia:
\`\`\`json
{
  "routeMatchFound": true,
  "message": "¡Coincidencia encontrada y notificación preparada!",
  "emailSubject": "¡Viaje Encontrado! Origen Ejemplo - Destino Ejemplo",
  "emailMessage": "Hola,\\n\\nHemos encontrado un viaje: Origen Ejemplo a Destino Ejemplo para 2025-07-15.\\nDetalles:\\n- Fecha y Hora Programada: 15 de julio de 2025 a las 10:00 (UTC)\\n- Conductor: Juan Perez\\n- Asientos: 2\\nRevisa y reserva en ${APP_NAME}.\\nSaludos,\\nEl equipo de ${APP_NAME}"
}
\`\`\`
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
  
  // Validar que emailSubject y emailMessage existan y sean strings no vacíos
  const hasValidEmailContent = llmResult.routeMatchFound &&
                               typeof llmResult.emailSubject === 'string' && 
                               llmResult.emailSubject.trim() !== '' &&
                               typeof llmResult.emailMessage === 'string' &&
                               llmResult.emailMessage.trim() !== '';

  if (hasValidEmailContent) {
    let cleanedSubject = (llmResult.emailSubject || '').trim().replace(/\s+/g, ' '); 

    if (cleanedSubject.length > 70) {
        cleanedSubject = cleanedSubject.substring(0, 67) + "...";
    }
    // Fallback si la limpieza deja el asunto vacío pero originalmente tenía contenido
    if (cleanedSubject.length === 0 && (llmResult.emailSubject || '').trim().length > 0) { 
        cleanedSubject = `Viaje Encontrado: ${input.origin} - ${input.destination}`;
    }
    
    console.log(`[watchRoute] LLM generó contenido de correo. Asunto (limpio): "${cleanedSubject}", Cuerpo (inicio): "${(llmResult.emailMessage || '').substring(0, 100)}..."`);
    notificationSent = await sendNotification(
      input.passengerEmail,
      cleanedSubject,
      llmResult.emailMessage! // Sabemos que es un string no vacío por hasValidEmailContent
    );
    console.log(`[watchRoute] Resultado de sendNotification: ${notificationSent}`);
  } else if (llmResult.routeMatchFound) {
    console.warn("[watchRoute] Coincidencia de ruta encontrada, pero el LLM no generó emailSubject y/o emailMessage válidos. No se enviará notificación.");
    if (typeof llmResult.emailSubject !== 'string' || llmResult.emailSubject.trim() === '') console.warn("[watchRoute] Causa: emailSubject falta, no es string o es vacío.");
    if (typeof llmResult.emailMessage !== 'string' || llmResult.emailMessage.trim() === '') console.warn("[watchRoute] Causa: emailMessage falta, no es string o es vacío.");
  } else {
    console.log("[watchRoute] No se encontró coincidencia de ruta según el LLM. No se enviará correo.");
  }

  return {
    routeMatchFound: llmResult.routeMatchFound,
    notificationSent: notificationSent,
    message: llmResult.message,
    emailContent: (hasValidEmailContent) 
      ? { subject: llmResult.emailSubject!, body: llmResult.emailMessage! } 
      : undefined
  };
}

export type { WatchRouteInput, WatchRouteOutput };

