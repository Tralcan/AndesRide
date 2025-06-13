
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
  WatchRoutePromptInputSchema,
  type WatchRoutePromptInput,
  type WatchRouteOutput
} from './route-watcher-types';
import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale/es';


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

const WatchRouteLLMOutputSchema = z.object({
  routeMatchFound: z.boolean().describe('Indica si se encontró una ruta coincidente REAL Y PUBLICADA.'),
  message: z.string().describe('Un mensaje que resume el resultado de la vigilancia de la ruta.'),
  emailSubject: z.string().optional().describe('Asunto del correo electrónico. Breve, profesional, conciso, max 70 caracteres. Incluir origen, destino y fecha (DD/MM/YYYY). NO USAR emojis.'),
  emailMessage: z.string().optional().describe('Cuerpo del correo electrónico. Amigable, con detalles del viaje (conductor, hora, asientos). Si no hay viaje, este campo puede omitirse o ser un mensaje corto indicando que no se encontró viaje.')
});
export type WatchRouteLLMOutput = z.infer<typeof WatchRouteLLMOutputSchema>;

const prompt = ai.definePrompt({
  name: 'watchRoutePrompt',
  input: {schema: WatchRoutePromptInputSchema},
  output: {schema: WatchRouteLLMOutputSchema },
  prompt: `Eres un vigilante de rutas para ${APP_NAME}.
Tu tarea es analizar si hay viajes publicados que coincidan con la ruta guardada del pasajero y generar el contenido para una notificación por correo electrónico.
RESPONDE ÚNICAMENTE EN FORMATO JSON. Tu respuesta DEBE seguir el schema Zod: {{outputSchema}}.
NO REPITAS TEXTO. NO USES emojis. Entrega solo el JSON.

Datos de la ruta guardada del pasajero:
- Email: {{{passengerEmail}}}
- Origen: {{{origin}}}
- Destino: {{{destination}}}
- Fecha deseada (YYYY-MM-DD): {{{date}}} (esta es la fecha para la cual se busca el viaje)

Viajes publicados coincidentes (JSON string, toma el PRIMER viaje si hay varios. Si está vacío o es "[]", no hay coincidencias):
{{{matchingTripsJson}}}

Instrucciones para el JSON de salida:

1.  'routeMatchFound' (boolean):
    -   \`true\` si 'matchingTripsJson' NO está vacío, NO es "[]" y contiene al menos un viaje.
    -   \`false\` si 'matchingTripsJson' está vacío o es "[]".

2.  'message' (string):
    -   Si 'routeMatchFound' es \`true\`: "¡Coincidencia encontrada para tu ruta {{{origin}}} - {{{destination}}} el {{{date}}}!"
    -   Si 'routeMatchFound' es \`false\`: "No se encontraron viajes para tu ruta {{{origin}}} - {{{destination}}} en la fecha {{{date}}}."

3.  'emailSubject' (string, OBLIGATORIO si 'routeMatchFound' es \`true\`):
    -   Debe ser MUY CORTO y profesional.
    -   Formato: "¡Viaje Encontrado! {{{origin}}} a {{{destination}}} (DD/MM/YYYY)"
    -   La fecha en el asunto DEBE ser la fecha {{{date}}} del input, formateada como DD/MM/YYYY.
    -   No exceder los 70 caracteres.

4.  'emailMessage' (string, OBLIGATORIO si 'routeMatchFound' es \`true\`):
    -   Si 'routeMatchFound' es \`true\`, construye un mensaje amigable.
        -   Saludo: "Hola,"
        -   Cuerpo: "Hemos encontrado un viaje que coincide con tu ruta guardada de {{{origin}}} a {{{destination}}} para el {{#jsonPath matchingTripsJson "$[0].departureDateTime"}}{{formatDate this "dd 'de' MMMM 'de' yyyy" "es"}}{{/jsonPath}}." (Usa el departureDateTime del primer viaje para la fecha en el mensaje).
        -   Detalles del viaje (del primer viaje en 'matchingTripsJson'):
            -   Origen: {{{matchingTripsJson.[0].origin}}}
            -   Destino: {{{matchingTripsJson.[0].destination}}}
            -   Fecha y Hora Programada: {{#jsonPath matchingTripsJson "$[0].departureDateTime"}}{{formatDate this "dd 'de' MMMM 'de' yyyy 'a las' HH:mm 'hrs (UTC)'" "es"}}{{/jsonPath}}.
            -   Conductor: {{matchingTripsJson.[0].driverFullName}}
            -   Asientos Disponibles: {{matchingTripsJson.[0].seatsAvailable}}
        -   Llamada a la acción: "Puedes ver más detalles y solicitar tu asiento en ${APP_NAME}."
        -   Despedida: "Saludos,\nEl equipo de ${APP_NAME}"
    -   Si 'routeMatchFound' es \`false\`, este campo puede ser una cadena vacía o un mensaje simple como "No hay viajes disponibles por ahora."

Ejemplo de JSON esperado si hay coincidencia:
\`\`\`json
{
  "routeMatchFound": true,
  "message": "¡Coincidencia encontrada para tu ruta Ejemplo Origen - Ejemplo Destino el AAAA-MM-DD!",
  "emailSubject": "¡Viaje Encontrado! Ejemplo Origen a Ejemplo Destino (DD/MM/YYYY)",
  "emailMessage": "Hola,\\n\\nHemos encontrado un viaje que coincide con tu ruta guardada de Ejemplo Origen a Ejemplo Destino para el 30 de junio de 2025.\\n\\nDetalles del viaje encontrado:\\n- Origen: Ejemplo Origen\\n- Destino: Ejemplo Destino\\n- Fecha y Hora Programada: 30 de junio de 2025 a las 10:00 hrs (UTC-4 / Hora de Santiago).\\n- Conductor: Nombre del Conductor\\n- Asientos Disponibles: 2\\n\\nPuedes ver más detalles y solicitar tu asiento en ${APP_NAME}.\\n\\nSaludos,\\nEl equipo de ${APP_NAME}"
}
\`\`\`

Ejemplo de JSON esperado si NO hay coincidencia:
\`\`\`json
{
  "routeMatchFound": false,
  "message": "No se encontraron viajes para tu ruta Ejemplo Origen - Ejemplo Destino en la fecha AAAA-MM-DD.",
  "emailSubject": "",
  "emailMessage": "No hay viajes disponibles por ahora."
}
\`\`\`
`,
  config: {
    temperature: 0.2, // Reducir la creatividad para respuestas más consistentes
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
         // No devolver un error aquí, sino un objeto de salida que indique el fallo
        return {
            routeMatchFound: false,
            message: `Error al buscar viajes: ${error.message || 'Error desconocido'}`
        };
    }
    
    const matchingTripsJson = JSON.stringify(matchingTrips);
    console.log('[watchRouteFlow] String JSON de viajes coincidentes para el LLM:', matchingTripsJson);

    const promptInput: WatchRoutePromptInput = {
        ...input,
        matchingTripsJson: matchingTripsJson,
    };

    console.log('[watchRouteFlow] Input para el prompt del LLM (incluyendo matchingTripsJson):', JSON.stringify(promptInput, null, 2));
    
    let llmOutput: WatchRouteLLMOutput | null = null;
    try {
      const { output } = await prompt(promptInput);
      llmOutput = output;
      console.log('[watchRouteFlow] Output del LLM (WatchRouteLLMOutputSchema):', JSON.stringify(llmOutput, null, 2));
    } catch (error: any) {
      console.error('[watchRouteFlow] Error DURANTE LA LLAMADA al prompt del LLM:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return {
        routeMatchFound: false,
        message: `Error al procesar la solicitud con IA: ${error.message || 'Error desconocido del LLM.'}`,
      };
    }

    if (!llmOutput) {
      console.error('[watchRouteFlow] No se recibió una respuesta estructurada del LLM (llmOutput es null o undefined).');
      return {
        routeMatchFound: false,
        message: `Error: No se recibió una respuesta del LLM para la ruta de ${input.origin} a ${input.destination}.`,
      };
    }
    
    return llmOutput;
  }
);

export async function watchRoute(input: WatchRouteInput): Promise<WatchRouteOutput> {
  console.log('[watchRoute] Invoking watchRouteFlow with input:', JSON.stringify(input, null, 2));
  const llmResult = await watchRouteFlow(input); 
  console.log('[watchRoute] LLM Result:', JSON.stringify(llmResult, null, 2));

  let notificationSent = false;
  
  const passengerDateFormatted = format(parseISO(input.date), "dd 'de' MMMM 'de' yyyy", { locale: es });

  // Validar que emailSubject y emailMessage existan y sean strings no vacíos
  const hasValidSubject = typeof llmResult.emailSubject === 'string' && llmResult.emailSubject.trim() !== '';
  const hasValidMessage = typeof llmResult.emailMessage === 'string' && llmResult.emailMessage.trim() !== '';

  if (llmResult.routeMatchFound && hasValidSubject && hasValidMessage) {
    let cleanedSubject = llmResult.emailSubject!.trim().replace(/\s+/g, ' ');
    
    // Truncar si el asunto es demasiado largo
    if (cleanedSubject.length > 70) {
        cleanedSubject = cleanedSubject.substring(0, 67) + "...";
        console.warn(`[watchRoute] emailSubject truncado a: "${cleanedSubject}"`);
    }
    
    // Fallback por si el LLM devuelve un subject vacío pero debería haber uno
    if (cleanedSubject.length === 0 && llmResult.emailSubject !== undefined) { 
        cleanedSubject = `¡Viaje Encontrado! ${input.origin} a ${input.destination} (${format(parseISO(input.date), "dd/MM/yyyy", { locale: es })})`;
        console.warn(`[watchRoute] emailSubject estaba vacío, usando fallback: "${cleanedSubject}"`);
    }
    
    console.log(`[watchRoute] LLM generó asunto y mensaje. Asunto (limpio): "${cleanedSubject}"`);
    notificationSent = await sendNotification(
      input.passengerEmail,
      cleanedSubject,
      llmResult.emailMessage! // Sabemos que es un string no vacío por hasValidMessage
    );
    console.log(`[watchRoute] Resultado de sendNotification: ${notificationSent}`);
  } else if (llmResult.routeMatchFound) {
    console.warn("[watchRoute] Coincidencia de ruta encontrada, pero el LLM no generó emailSubject y/o emailMessage válidos. No se enviará notificación.");
    if (!hasValidSubject) console.warn("[watchRoute] Causa: emailSubject falta, no es string o es vacío. Valor recibido:", llmResult.emailSubject);
    if (!hasValidMessage) console.warn("[watchRoute] Causa: emailMessage falta, no es string o es vacío. Valor recibido:", llmResult.emailMessage);
  } else {
    console.log("[watchRoute] No se encontró coincidencia de ruta según el LLM (o hubo un error en el LLM). No se enviará correo.");
  }

  return {
    routeMatchFound: llmResult.routeMatchFound,
    notificationSent: notificationSent,
    message: llmResult.message || "Mensaje no proporcionado por el LLM.",
    emailContent: (llmResult.routeMatchFound && hasValidSubject && hasValidMessage)
      ? { subject: llmResult.emailSubject!, body: llmResult.emailMessage! }
      : undefined
  };
}

export type { WatchRouteInput, WatchRouteOutput };

    
