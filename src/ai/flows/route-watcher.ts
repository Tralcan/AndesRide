
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
  type WatchRouteOutput,
  WatchRouteLLMOutputSchema
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

export type WatchRouteLLMOutput = z.infer<typeof WatchRouteLLMOutputSchema>;

const prompt = ai.definePrompt({
  name: 'watchRoutePrompt',
  input: {schema: WatchRoutePromptInputSchema},
  output: {schema: WatchRouteLLMOutputSchema },
  prompt: `Eres un vigilante de rutas para ${APP_NAME}.
Tu tarea es determinar si hay un viaje publicado que coincida con la ruta guardada del pasajero y generar el contenido para una notificación por correo electrónico.
RESPONDE ÚNICAMENTE EN FORMATO JSON. Tu respuesta DEBE seguir el schema Zod: {{outputSchema}}.
NO REPITAS TEXTO. NO USES emojis. Entrega solo el JSON.

Datos de la ruta guardada del pasajero:
- Email: {{{passengerEmail}}}
- Origen del pasajero: {{{origin}}}
- Destino del pasajero: {{{destination}}}
- Fecha deseada por el pasajero (YYYY-MM-DD): {{{date}}}

{{#if tripFound}}
Se encontró el siguiente viaje coincidente:
- Origen del Viaje: {{{tripOrigin}}}
- Destino del Viaje: {{{tripDestination}}}
- Fecha y Hora Programada del Viaje (UTC): {{{tripDepartureDateTime}}} (Este campo es la cadena "dd de MMMM de yyyy a las HH:mm hrs (UTC)")
- Fecha Formateada del Viaje (para el asunto): {{{tripDepartureDateFormatted}}} (Este campo es la cadena "dd de MMMM de yyyy")
- Conductor: {{{tripDriverFullName}}}
- Asientos Disponibles: {{{tripSeatsAvailable}}}

Instrucciones para el JSON de salida (SI 'tripFound' es true):
1.  'routeMatchFound': true
2.  'message': "¡Coincidencia encontrada para tu ruta {{{origin}}} - {{{destination}}} el {{{tripDepartureDateFormatted}}}!"
3.  'emailSubject': "¡Viaje Encontrado! {{{origin}}} a {{{destination}}} ({{{tripDepartureDateFormatted}}})" (Debe ser MUY CORTO, profesional, max 70 caracteres. USA {{{tripDepartureDateFormatted}}} para la fecha.)
4.  'emailMessage': "Hola,\\n\\nHemos encontrado un viaje que coincide con tu ruta guardada de {{{origin}}} a {{{destination}}} para el {{{tripDepartureDateFormatted}}}.\\n\\nDetalles del viaje encontrado:\\n- Origen: {{{tripOrigin}}}\\n- Destino: {{{tripDestination}}}\\n- Fecha y Hora Programada: {{{tripDepartureDateTime}}}\\n- Conductor: {{{tripDriverFullName}}}\\n- Asientos Disponibles: {{{tripSeatsAvailable}}}\\n\\nPuedes ver más detalles y solicitar tu asiento en ${APP_NAME}.\\n\\nSaludos,\\nEl equipo de ${APP_NAME}" (ESTE CAMPO ES OBLIGATORIO SI 'tripFound' es true)
{{else}}
No se encontró ningún viaje coincidente para la ruta y fecha especificadas.

Instrucciones para el JSON de salida (SI 'tripFound' es false):
1.  'routeMatchFound': false
2.  'message': "No se encontraron viajes para tu ruta {{{origin}}} - {{{destination}}} en la fecha {{{date}}}."
3.  'emailSubject': ""
4.  'emailMessage': "Lamentablemente, no hemos encontrado viajes que coincidan con tu ruta guardada de {{{origin}}} a {{{destination}}} para la fecha {{{date}}}. Seguiremos buscando por ti."
{{/if}}

**MUY IMPORTANTE: Asegúrate de generar los campos 'emailSubject' y 'emailMessage' correctamente y por separado. El campo 'emailMessage' ES OBLIGATORIO si 'routeMatchFound' es true. No incluyas información extra fuera del JSON.**

Ejemplo de JSON esperado si hay coincidencia:
\`\`\`json
{
  "routeMatchFound": true,
  "message": "¡Coincidencia encontrada para tu ruta Ejemplo Origen - Ejemplo Destino el 30 de junio de 2025!",
  "emailSubject": "¡Viaje Encontrado! Ejemplo Origen a Ejemplo Destino (30 de junio de 2025)",
  "emailMessage": "Hola,\\n\\nHemos encontrado un viaje que coincide con tu ruta guardada de Ejemplo Origen a Ejemplo Destino para el 30 de junio de 2025.\\n\\nDetalles del viaje encontrado:\\n- Origen: Ejemplo Origen\\n- Destino: Ejemplo Destino\\n- Fecha y Hora Programada: 30 de junio de 2025 a las 14:00 hrs (UTC)\\n- Conductor: Nombre del Conductor\\n- Asientos Disponibles: 2\\n\\nPuedes ver más detalles y solicitar tu asiento en ${APP_NAME}.\\n\\nSaludos,\\nEl equipo de ${APP_NAME}"
}
\`\`\`

Ejemplo de JSON esperado si NO hay coincidencia:
\`\`\`json
{
  "routeMatchFound": false,
  "message": "No se encontraron viajes para tu ruta Ejemplo Origen - Ejemplo Destino en la fecha AAAA-MM-DD.",
  "emailSubject": "",
  "emailMessage": "Lamentablemente, no hemos encontrado viajes que coincidan con tu ruta guardada de Ejemplo Origen a Ejemplo Destino para la fecha AAAA-MM-DD. Seguiremos buscando por ti."
}
\`\`\`
`,
  config: {
    temperature: 0.2, // Temperatura baja para respuestas más predecibles
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
        return {
            routeMatchFound: false,
            message: `Error al buscar viajes: ${error.message || 'Error desconocido'}`
            // emailSubject y emailMessage serán undefined
        };
    }
    
    const firstMatchingTrip = matchingTrips.length > 0 ? matchingTrips[0] : null;

    const promptInput: WatchRoutePromptInput = {
        passengerEmail: input.passengerEmail,
        origin: input.origin,
        destination: input.destination,
        date: input.date, // Fecha deseada por el pasajero (YYYY-MM-DD)
        tripFound: !!firstMatchingTrip,
        tripOrigin: firstMatchingTrip?.origin,
        tripDestination: firstMatchingTrip?.destination,
        tripDepartureDateTime: firstMatchingTrip?.departureDateTime, // Ya formateado como "dd de MMMM de yyyy a las HH:mm hrs (UTC)"
        tripDepartureDateFormatted: firstMatchingTrip?.departureDateFormatted, // Ya formateado como "dd de MMMM de yyyy"
        tripDriverFullName: firstMatchingTrip?.driverFullName,
        tripSeatsAvailable: firstMatchingTrip?.seatsAvailable,
    };

    console.log('[watchRouteFlow] Input para el prompt del LLM (con detalles del primer viaje procesados):', JSON.stringify(promptInput, null, 2));
    
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
    
    const parsedOutput = WatchRouteLLMOutputSchema.safeParse(llmOutput);
    if (!parsedOutput.success) {
      console.error('[watchRouteFlow] LLM output no validó contra WatchRouteLLMOutputSchema:', JSON.stringify(parsedOutput.error.flatten(), null, 2));
      console.error('[watchRouteFlow] LLM output original que falló la validación:', JSON.stringify(llmOutput, null, 2));
      return {
        routeMatchFound: false, 
        message: "Error: La respuesta de la IA no tuvo el formato esperado.",
      };
    }

    return parsedOutput.data;
  }
);

export async function watchRoute(input: WatchRouteInput): Promise<WatchRouteOutput> {
  console.log('[watchRoute] Invoking watchRouteFlow with input:', JSON.stringify(input, null, 2));
  const llmResult = await watchRouteFlow(input); 
  console.log('[watchRoute] LLM Result:', JSON.stringify(llmResult, null, 2));

  let notificationSent = false;
  
  // Validación más estricta: emailSubject y emailMessage deben ser strings y no estar vacíos
  const hasValidSubject = typeof llmResult.emailSubject === 'string' && llmResult.emailSubject.trim() !== '';
  const hasValidMessage = typeof llmResult.emailMessage === 'string' && llmResult.emailMessage.trim() !== '';

  if (llmResult.routeMatchFound && hasValidSubject && hasValidMessage) {
    let cleanedSubject = llmResult.emailSubject!.trim().replace(/\s+/g, ' '); // Limpiar espacios extra
    
    const maxSubjectLength = 70; // Límite de caracteres para el asunto
    if (cleanedSubject.length > maxSubjectLength) {
        cleanedSubject = cleanedSubject.substring(0, maxSubjectLength - 3) + "...";
        console.warn(`[watchRoute] emailSubject truncado a: "${cleanedSubject}"`);
    }
    
    // Fallback si el subject está vacío después del trim, pero el campo existía.
    if (cleanedSubject.length === 0 && typeof llmResult.emailSubject === 'string') { 
        const passengerDateFormatted = format(parseISO(input.date), "dd/MM/yyyy", { locale: es });
        cleanedSubject = `¡Viaje Encontrado! ${input.origin} a ${input.destination} (${passengerDateFormatted})`;
        console.warn(`[watchRoute] emailSubject estaba vacío o contenía solo espacios, usando fallback: "${cleanedSubject}"`);
    }
    
    console.log(`[watchRoute] LLM generó asunto y mensaje. Asunto (limpio): "${cleanedSubject}"`);
    console.log(`[watchRoute] Mensaje del correo (primeros 100 chars): "${llmResult.emailMessage!.substring(0,100)}..."`);
    
    notificationSent = await sendNotification(
      input.passengerEmail,
      cleanedSubject,
      llmResult.emailMessage! // Sabemos que es válido y no vacío aquí
    );
    console.log(`[watchRoute] Resultado de sendNotification: ${notificationSent}`);
  } else if (llmResult.routeMatchFound) {
    console.warn("[watchRoute] Coincidencia de ruta encontrada, pero el LLM no generó emailSubject y/o emailMessage válidos. No se enviará notificación.");
    if (!hasValidSubject) console.warn("[watchRoute] Causa: emailSubject falta, no es string o es vacío/solo espacios. Valor recibido:", llmResult.emailSubject);
    if (!hasValidMessage) console.warn("[watchRoute] Causa: emailMessage falta, no es string o es vacío/solo espacios. Valor recibido:", llmResult.emailMessage);
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
