// src/ai/flows/route-watcher.ts
'use server';
/**
 * @fileOverview Un agente de IA para vigilar rutas que notifica a los usuarios cuando los viajes coinciden con sus rutas guardadas.
 * El LLM ahora solo genera el asunto del correo. El cuerpo se construye en TypeScript.
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
  WatchRouteLLMOutputSchema, // Ahora solo espera routeMatchFound, message, emailSubject
  type WatchRouteLLMOutput,
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
    messageBody: string // Cambiado de 'message' a 'messageBody' para claridad
): Promise<boolean> {
  console.log('[sendNotification FUNCTION] INVOCADA CON:', { passengerEmail, subjectLength: subject?.length, messageBodyLength: messageBody?.length });

  if (!resend) {
    console.error('[sendNotification FUNCTION] Resend client no está inicializado. No se puede enviar el email. Verifica la RESEND_API_KEY.');
    return false;
  }
  if (!APP_NAME) {
    console.error("[sendNotification FUNCTION] APP_NAME no está definido. No se puede enviar el email.");
    return false;
  }
   if (!passengerEmail || !subject || !messageBody) { // Verificación actualizada
    console.error(`[sendNotification FUNCTION] Faltan campos requeridos. Recibido: passengerEmail=${passengerEmail}, subject (longitud)=${subject?.length}, messageBody (longitud)=${messageBody?.length}. No se puede enviar el email.`);
    return false;
  }
  console.log(`[sendNotification FUNCTION] Intentando enviar email. De: ${APP_NAME} <onboarding@resend.dev>, Para: ${passengerEmail}, Asunto: "${subject}"`);

  try {
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <onboarding@resend.dev>`,
      to: [passengerEmail],
      subject: subject,
      html: `<p>${messageBody.replace(/\n/g, '<br>')}</p>`,
      text: messageBody,
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
  name: 'watchRoutePromptMinimal',
  input: {schema: WatchRoutePromptInputSchema},
  output: {schema: WatchRouteLLMOutputSchema }, // El LLM solo genera subject, message y routeMatchFound
  prompt: `Eres un vigilante de rutas para ${APP_NAME}.
Tu tarea es determinar si hay un viaje publicado que coincida con la ruta guardada del pasajero y generar un ASUNTO para una notificación por correo electrónico.
RESPONDE ÚNICAMENTE EN FORMATO JSON. Tu respuesta DEBE seguir el schema Zod: {{outputSchema}}.
NO REPITAS TEXTO. NO USES emojis. NO INVENTES INFORMACIÓN. Entrega solo el JSON.

Datos de la ruta guardada del pasajero:
- Email: {{{passengerEmail}}}
- Origen del pasajero: {{{origin}}}
- Destino del pasajero: {{{destination}}}
- Fecha deseada por el pasajero (YYYY-MM-DD): {{{date}}}

{{#if tripFound}}
Se encontró el siguiente viaje coincidente:
- Origen del Viaje: {{{tripOrigin}}}
- Destino del Viaje: {{{tripDestination}}}
- Fecha y Hora Programada del Viaje (Formateada y en UTC): {{{tripDepartureDateTime}}}
- Fecha Formateada del Viaje (para el asunto, ej: "30 de junio de 2025"): {{{tripDepartureDateFormatted}}}
- Conductor: {{{tripDriverFullName}}}
- Asientos Disponibles: {{{tripSeatsAvailable}}}

Instrucciones para el JSON de salida (SI 'tripFound' es true):
1.  'routeMatchFound': DEBE ser true.
2.  'message': Un mensaje MUY CORTO confirmando la coincidencia. Ejemplo: "¡Coincidencia encontrada para tu ruta {{{origin}}} - {{{destination}}}!"
3.  'emailSubject': Un asunto de correo MUY CORTO, profesional y conciso, MÁXIMO 70 CARACTERES, SIN emojis, SIN repeticiones. Ejemplo: "¡Viaje Encontrado! {{{origin}}} a {{{destination}}} ({{{tripDepartureDateFormatted}}})"

{{else}}
No se encontró ningún viaje coincidente para la ruta y fecha especificadas.

Instrucciones para el JSON de salida (SI 'tripFound' es false):
1.  'routeMatchFound': DEBE ser false.
2.  'message': Un mensaje MUY CORTO indicando que no se encontró coincidencia. Ejemplo: "No se encontraron viajes para tu ruta {{{origin}}} - {{{destination}}} en la fecha {{{date}}}."
3.  'emailSubject': DEBE ser una cadena vacía "".
{{/if}}

**MUY IMPORTANTE: Entrega únicamente un objeto JSON válido que cumpla con el 'outputSchema' Zod proporcionado. Asegúrate de que el campo 'emailSubject' se genere correctamente y el campo 'emailMessage' NO SE GENERE AQUÍ (se generará en el código).**

Ejemplo de JSON esperado SI hay coincidencia:
\`\`\`json
{
  "routeMatchFound": true,
  "message": "¡Coincidencia encontrada para tu ruta Ejemplo Origen - Ejemplo Destino!",
  "emailSubject": "¡Viaje Encontrado! Ejemplo Origen a Ejemplo Destino (30 de junio de 2025)"
}
\`\`\`

Ejemplo de JSON esperado si NO hay coincidencia:
\`\`\`json
{
  "routeMatchFound": false,
  "message": "No se encontraron viajes para tu ruta Ejemplo Origen - Ejemplo Destino en la fecha AAAA-MM-DD.",
  "emailSubject": ""
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
        return { // Devuelve un objeto WatchRouteLLMOutput válido
            routeMatchFound: false,
            message: `Error al buscar viajes: ${error.message || 'Error desconocido'}`,
            emailSubject: ''
        };
    }
    
    const firstMatchingTrip = matchingTrips.length > 0 ? matchingTrips[0] : null;

    const promptInput: WatchRoutePromptInput = {
        passengerEmail: input.passengerEmail,
        origin: input.origin,
        destination: input.destination,
        date: input.date, 
        tripFound: !!firstMatchingTrip,
        tripOrigin: firstMatchingTrip?.origin,
        tripDestination: firstMatchingTrip?.destination,
        tripDepartureDateTime: firstMatchingTrip?.departureDateTime, // Ya formateado en UTC
        tripDepartureDateFormatted: firstMatchingTrip?.departureDateFormatted, // Ya formateado
        tripDriverFullName: firstMatchingTrip?.driverFullName,
        tripSeatsAvailable: firstMatchingTrip?.seatsAvailable,
    };

    console.log('[watchRouteFlow] Input para el prompt del LLM (con detalles del primer viaje procesados):', JSON.stringify(promptInput, null, 2));
    
    try {
      const { output } = await prompt(promptInput); 
      const llmOutput = output; 
      console.log('[watchRouteFlow] Output del LLM (WatchRouteLLMOutputSchema):', JSON.stringify(llmOutput, null, 2));

      if (!llmOutput) {
        console.error('[watchRouteFlow] El LLM devolvió null o undefined.');
        return {
          routeMatchFound: false,
          message: 'Error: El LLM no devolvió una respuesta.',
          emailSubject: ''
        };
      }
      
      const parsedOutput = WatchRouteLLMOutputSchema.safeParse(llmOutput);
      if (!parsedOutput.success) {
        console.error('[watchRouteFlow] LLM output no validó contra WatchRouteLLMOutputSchema:', JSON.stringify(parsedOutput.error.flatten(), null, 2));
        console.error('[watchRouteFlow] LLM output original que falló la validación:', JSON.stringify(llmOutput, null, 2));
        return {
          routeMatchFound: false, 
          message: "Error: La respuesta de la IA no tuvo el formato esperado.",
          emailSubject: ''
        };
      }
      
      if (parsedOutput.data.routeMatchFound && (typeof parsedOutput.data.emailSubject !== 'string' || parsedOutput.data.emailSubject.trim() === '')) {
          console.warn('[watchRouteFlow] Advertencia: routeMatchFound es true, pero emailSubject falta o está vacío. Usando fallback para subject.');
          const fallbackSubject = `¡Viaje Encontrado! ${input.origin} a ${input.destination} (${promptInput.tripDepartureDateFormatted || input.date})`;
          parsedOutput.data.emailSubject = fallbackSubject;
      }

      return parsedOutput.data;

    } catch (error: any) {
      // Este log es crucial para ver errores directos de la llamada al LLM
      console.error('[watchRouteFlow] Error DURANTE LA LLAMADA al prompt del LLM:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return {
        routeMatchFound: false, 
        message: `Error al procesar la solicitud con IA: ${error.message || 'Error desconocido del LLM.'}`,
        emailSubject: ''
      };
    }
  }
);

export async function watchRoute(input: WatchRouteInput): Promise<WatchRouteOutput> {
  console.log('[watchRoute] Invoking watchRouteFlowInternal con input:', JSON.stringify(input, null, 2));
  
  // Volvemos a buscar los detalles del viaje aquí para construir el emailMessage.
  // Esto es para asegurar que tenemos los datos más frescos y correctos,
  // especialmente si el LLM no los devuelve o los devuelve mal.
  let firstMatchingTripForEmail: PublishedTripDetails | null = null;
  try {
      const searchInputForEmailBody: FindPublishedMatchingTripsInput = {
          origin: input.origin,
          destination: input.destination,
          searchDate: input.date,
      };
      const matchingTripsForEmail = await findPublishedMatchingTripsAction(searchInputForEmailBody);
      firstMatchingTripForEmail = matchingTripsForEmail.length > 0 ? matchingTripsForEmail[0] : null;
  } catch (error) {
      console.error("[watchRoute] Error al buscar detalles del viaje para el cuerpo del email:", error);
      // No retornamos aquí, el flujo del LLM puede continuar y notificar sin detalles del viaje si es necesario.
  }
  
  const llmResult = await watchRouteFlow(input); 
  console.log('[watchRoute] LLM Result (desde watchRouteFlowInternal):', JSON.stringify(llmResult, null, 2));

  let notificationSent = false;
  let finalEmailSubject = "";
  let finalEmailMessageBody = ""; // Cuerpo del correo

  const hasValidSubjectFromLLM = llmResult.emailSubject && typeof llmResult.emailSubject === 'string' && llmResult.emailSubject.trim() !== '';

  if (llmResult.routeMatchFound && hasValidSubjectFromLLM && firstMatchingTripForEmail) {
      // Limpiar y truncar el subject
      finalEmailSubject = llmResult.emailSubject.trim().replace(/\s+/g, ' ');
      const maxSubjectLength = 70;
      if (finalEmailSubject.length > maxSubjectLength) {
          finalEmailSubject = finalEmailSubject.substring(0, maxSubjectLength - 3) + "...";
      }
       if (finalEmailSubject.length === 0) { // Fallback si el subject quedó vacío después de limpiar
          const passengerDateFormatted = firstMatchingTripForEmail.departureDateFormatted || format(parseISO(input.date), "dd 'de' MMMM 'de' yyyy", { locale: es });
          finalEmailSubject = `¡Viaje Encontrado! ${input.origin} a ${input.destination} (${passengerDateFormatted})`;
          console.warn(`[watchRoute] emailSubject del LLM estaba vacío después de limpiar, usando fallback: "${finalEmailSubject}"`);
      }

      // Construir el cuerpo del email aquí, usando los datos del viaje
      finalEmailMessageBody = `Hola,\n\nHemos encontrado un viaje que coincide con tu ruta guardada de ${input.origin} a ${input.destination} para la fecha ${firstMatchingTripForEmail.departureDateFormatted}.\n\nDetalles del viaje encontrado:\n- Origen: ${firstMatchingTripForEmail.origin}\n- Destino: ${firstMatchingTripForEmail.destination}\n- Fecha y Hora Programada: ${firstMatchingTripForEmail.departureDateTime}\n- Conductor: ${firstMatchingTripForEmail.driverFullName || 'No especificado'}\n- Asientos Disponibles: ${firstMatchingTripForEmail.seatsAvailable}\n\nPuedes ver más detalles y solicitar tu asiento en ${APP_NAME}.\n\nSaludos,\nEl equipo de ${APP_NAME}`;
      
      console.log(`[watchRoute] Intentando enviar notificación. Asunto (limpio y final): "${finalEmailSubject}"`);
      console.log(`[watchRoute] Mensaje del correo construido (primeros 100 chars): "${finalEmailMessageBody.substring(0,100)}..."`);
      
      notificationSent = await sendNotification(
        input.passengerEmail,
        finalEmailSubject,
        finalEmailMessageBody
      );
      console.log(`[watchRoute] Resultado de sendNotification: ${notificationSent}`);

  } else {
    let reason = "";
    if (!llmResult.routeMatchFound) reason = "No se encontró coincidencia de ruta según el LLM.";
    else if (!hasValidSubjectFromLLM) reason = "emailSubject falta, no es string o es vacío según el LLM.";
    else if (!firstMatchingTripForEmail) reason = "No se encontraron detalles del viaje para construir el email (inesperado si routeMatchFound es true).";
    else reason = "Condición desconocida para no enviar notificación.";
    
    console.warn(`[watchRoute] No se enviará notificación. Razón: ${reason}. Output LLM:`, JSON.stringify(llmResult, null, 2));
  }

  return {
    routeMatchFound: llmResult.routeMatchFound,
    notificationSent: notificationSent,
    message: llmResult.message || "Mensaje no proporcionado por el LLM.",
    emailContent: (notificationSent && finalEmailSubject && finalEmailMessageBody) // Guardar el cuerpo real enviado
      ? { subject: finalEmailSubject, body: finalEmailMessageBody }
      : undefined
  };
}

export type { WatchRouteInput, WatchRouteOutput };
