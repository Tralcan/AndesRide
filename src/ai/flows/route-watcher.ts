
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
  // WatchRouteLLMOutputSchema, // Se simplificará
  // type WatchRouteLLMOutput,
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

// Schema de salida simplificado para el LLM
const WatchRouteLLMSimpleOutputSchema = z.object({
  routeMatchFound: z.boolean().describe('Si se encontró una ruta coincidente REAL Y PUBLICADA.'),
  message: z.string().describe('Un mensaje que indica el resultado de la vigilancia de la ruta.'),
  emailSubject: z.string().optional().describe('El asunto del correo electrónico a enviar, si se encontró una coincidencia. Debe ser breve, profesional, conciso, y no exceder los 70 caracteres. NO USAR emojis. Incluir origen, destino y fecha (DD/MM/YYYY).'),
});
type WatchRouteLLMSimpleOutput = z.infer<typeof WatchRouteLLMSimpleOutputSchema>;


const prompt = ai.definePrompt({
  name: 'watchRoutePrompt',
  input: {schema: WatchRoutePromptInputSchema},
  output: {schema: WatchRouteLLMSimpleOutputSchema }, // Usar el schema simplificado
  prompt: `Eres un vigilante de rutas para ${APP_NAME}. Tu tarea es analizar si hay viajes coincidentes y generar SOLAMENTE el asunto del email.
RESPONDE ÚNICAMENTE EN FORMATO JSON. Tu respuesta DEBE seguir el schema Zod: {{outputSchema}}.
NO REPITAS TEXTO. NO USES emojis. Entrega solo el JSON.

Datos del pasajero:
- Email: {{{passengerEmail}}}
- Origen: {{{origin}}}
- Destino: {{{destination}}}
- Fecha deseada: {{{date}}} (formato YYYY-MM-DD)

Viajes publicados coincidentes (JSON string, usa el PRIMER viaje si hay varios. Si está vacío o es "[]", no hay coincidencias):
{{{matchingTripsJson}}}

Instrucciones para el JSON de salida:

1.  'routeMatchFound' (boolean):
    -   \`true\` si 'matchingTripsJson' NO está vacío y NO es "[]".
    -   \`false\` si 'matchingTripsJson' está vacío o es "[]".

2.  'message' (string):
    -   Si 'routeMatchFound' es \`true\`: "Coincidencia encontrada para tu ruta {{{origin}}} - {{{destination}}}."
    -   Si 'routeMatchFound' es \`false\`: "No se encontraron viajes para tu ruta {{{origin}}} - {{{destination}}} en la fecha {{{date}}}."

3.  'emailSubject' (string, OBLIGATORIO si 'routeMatchFound' es \`true\`):
    -   Debe ser MUY CORTO y profesional. Ejemplo: "¡Viaje Encontrado! {{{origin}}} a {{{destination}}} ({{{date}}})".
    -   La fecha en el asunto debe ser en formato DD/MM/YYYY.
    -   No exceder los 70 caracteres.
    -   NO incluyas detalles del viaje ni llamados a la acción aquí, solo el asunto.

Ejemplo de JSON esperado si hay coincidencia:
\`\`\`json
{
  "routeMatchFound": true,
  "message": "Coincidencia encontrada para tu ruta Ejemplo Origen - Ejemplo Destino.",
  "emailSubject": "¡Viaje Encontrado! Ejemplo Origen a Ejemplo Destino (DD/MM/YYYY)"
}
\`\`\`

Ejemplo de JSON esperado si NO hay coincidencia:
\`\`\`json
{
  "routeMatchFound": false,
  "message": "No se encontraron viajes para tu ruta Ejemplo Origen - Ejemplo Destino en la fecha Ejemplo Fecha."
}
\`\`\`
`,
  config: {
    temperature: 0.2,
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
    outputSchema: WatchRouteLLMSimpleOutputSchema, // Usar el schema simplificado
  },
  async (input: WatchRouteInput): Promise<WatchRouteLLMSimpleOutput> => {
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
    
    let llmOutput: WatchRouteLLMSimpleOutput | null = null;
    try {
      const { output } = await prompt(promptInput);
      llmOutput = output;
      console.log('[watchRouteFlow] Output del LLM (WatchRouteLLMSimpleOutputSchema):', JSON.stringify(llmOutput, null, 2));
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
  console.log('[watchRoute] LLM Result (simple):', JSON.stringify(llmResult, null, 2));

  let notificationSent = false;
  let emailMessage = ""; // Inicializar emailMessage

  if (llmResult.routeMatchFound && llmResult.emailSubject && llmResult.emailSubject.trim() !== '') {
    // Buscar los detalles del viaje para construir el cuerpo del email
    const searchInput: FindPublishedMatchingTripsInput = {
        origin: input.origin,
        destination: input.destination,
        searchDate: input.date,
    };
    let matchingTrips: PublishedTripDetails[] = [];
    try {
        matchingTrips = await findPublishedMatchingTripsAction(searchInput);
    } catch (error) {
        console.error('[watchRoute] Error obteniendo detalles del viaje para el email:', error);
    }

    if (matchingTrips.length > 0) {
        const trip = matchingTrips[0];
        let formattedDepartureTime = "Hora no especificada";
        try {
            // Formatear la fecha y hora para el correo
            const departureDate = parseISO(trip.departureDateTime); // trip.departureDateTime es '2025-06-30T14:00:00+00:00'
            // Formateamos a la hora local del servidor, que por defecto en Vercel es UTC.
            // Para un formato amigable, especificamos el idioma.
            // Si se quisiera una zona horaria específica, se necesitaría date-fns-tz o similar.
            formattedDepartureTime = format(departureDate, "dd 'de' MMMM 'de' yyyy 'a las' HH:mm 'hrs (UTC)'", { locale: es });
        } catch (e) {
            console.error("[watchRoute] Error al formatear la fecha para el email:", e);
            // Usar la cadena ISO directamente si el formateo falla
            formattedDepartureTime = `${trip.departureDateTime} (UTC)`;
        }
        
        emailMessage = `Hola,\n\nHemos encontrado un viaje para tu ruta de ${trip.origin} a ${trip.destination} para la fecha ${format(parseISO(input.date), "dd 'de' MMMM 'de' yyyy", { locale: es })}.\n\nDetalles del viaje encontrado:\n- Origen: ${trip.origin}\n- Destino: ${trip.destination}\n- Fecha y Hora Programada: ${formattedDepartureTime}\n- Conductor: ${trip.driverFullName || 'No especificado'}\n- Asientos Disponibles: ${trip.seatsAvailable}\n\nRevisa y reserva en ${APP_NAME}.\n\nSaludos,\nEl equipo de ${APP_NAME}`;
        console.log(`[watchRoute] Email message construido: ${emailMessage.substring(0, 100)}...`);
    } else {
        console.warn("[watchRoute] Coincidencia de ruta encontrada, pero no se pudieron recuperar los detalles del viaje para el email.");
        llmResult.message = "Coincidencia de ruta encontrada, pero hubo un error al generar los detalles para la notificación.";
    }
  }

  const hasValidSubject = llmResult.emailSubject && llmResult.emailSubject.trim() !== '';
  const hasValidMessage = emailMessage.trim() !== '';

  if (llmResult.routeMatchFound && hasValidSubject && hasValidMessage) {
    let cleanedSubject = llmResult.emailSubject!.trim().replace(/\s+/g, ' '); 

    if (cleanedSubject.length > 70) {
        cleanedSubject = cleanedSubject.substring(0, 67) + "...";
    }
     if (cleanedSubject.length === 0 && (llmResult.emailSubject || '').trim().length > 0) { 
        // Este fallback podría necesitar ajuste si el subject es basura como antes
        cleanedSubject = `Viaje Encontrado: ${input.origin} - ${input.destination}`;
    }
    
    console.log(`[watchRoute] LLM generó asunto. Asunto (limpio): "${cleanedSubject}"`);
    notificationSent = await sendNotification(
      input.passengerEmail,
      cleanedSubject,
      emailMessage
    );
    console.log(`[watchRoute] Resultado de sendNotification: ${notificationSent}`);
  } else if (llmResult.routeMatchFound) {
    console.warn("[watchRoute] Coincidencia de ruta encontrada, pero no se generó un asunto y/o mensaje de correo válido. No se enviará notificación.");
    if (!hasValidSubject) console.warn("[watchRoute] Causa: emailSubject falta, no es string o es vacío.");
    if (!hasValidMessage) console.warn("[watchRoute] Causa: emailMessage (construido) es vacío.");
  } else {
    console.log("[watchRoute] No se encontró coincidencia de ruta según el LLM (o hubo un error en el LLM). No se enviará correo.");
  }

  return {
    routeMatchFound: llmResult.routeMatchFound,
    notificationSent: notificationSent,
    message: llmResult.message || "Mensaje no proporcionado por el LLM.",
    emailContent: (llmResult.routeMatchFound && hasValidSubject && hasValidMessage)
      ? { subject: llmResult.emailSubject!, body: emailMessage }
      : undefined
  };
}

export type { WatchRouteInput, WatchRouteOutput };

    