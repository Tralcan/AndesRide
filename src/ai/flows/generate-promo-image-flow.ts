
'use server';
/**
 * @fileOverview A Genkit flow to generate promotional images for brands.
 *
 * - generatePromotionalImageForBrand - Generates an image based on brand name and optional custom prompt.
 * - GeneratePromotionalImageInput - Input type for the flow.
 * - GeneratePromotionalImageOutput - Output type for the flow.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GeneratePromotionalImageInputSchema = z.object({
  brandName: z.string().describe('The name of the brand for which to generate the image.'),
  customPrompt: z.string().optional().describe('An optional custom prompt to guide image generation. If not provided, a generic prompt will be used.'),
  promoText: z.string().optional().describe('Optional promotional text to overlay or integrate into the image.'),
});
export type GeneratePromotionalImageInput = z.infer<typeof GeneratePromotionalImageInputSchema>;

const GeneratePromotionalImageOutputSchema = z.object({
  imageDataUri: z.string().describe("The generated promotional image as a data URI. Expected format: 'data:image/png;base64,<encoded_data>'."),
});
export type GeneratePromotionalImageOutput = z.infer<typeof GeneratePromotionalImageOutputSchema>;

export async function generatePromotionalImageForBrand(input: GeneratePromotionalImageInput): Promise<GeneratePromotionalImageOutput> {
  return generatePromotionalImageFlow(input);
}

const generatePromotionalImageFlow = ai.defineFlow(
  {
    name: 'generatePromotionalImageFlow',
    inputSchema: GeneratePromotionalImageInputSchema,
    outputSchema: GeneratePromotionalImageOutputSchema,
  },
  async (input) => {
    // Updated default prompt
    let promptText = input.customPrompt || `Un banner promocional vibrante y atractivo para la marca "${input.brandName}". Estilo moderno y limpio. el banner debe tener unas dimensiones de 1200px ancho y 400px de alto, la imagen debe estar centrada.`;

    if (input.promoText) {
      // Simplified instruction for incorporating promo text
      promptText += ` Incorpora el siguiente texto promocional de forma destacada en la imagen: "${input.promoText}".`;
    }
    
    console.log(`[generatePromotionalImageFlow] Prompt para Genkit: ${promptText}`);

    try {
      const {media} = await ai.generate({
        model: 'googleai/gemini-2.0-flash-exp', 
        prompt: promptText,
        config: {
          responseModalities: ['TEXT', 'IMAGE'], 
        },
      });

      console.log('[generatePromotionalImageFlow] Full media object from Genkit:', JSON.stringify(media, null, 2));

      if (!media?.url) {
        console.error('[generatePromotionalImageFlow] Image generation did not return a valid media URL. Media object (stringified for detail):', JSON.stringify(media, null, 2));
        if (media && !media.url) {
            console.error('[generatePromotionalImageFlow] Media object exists, but media.url is missing or empty.');
        }
        // Throw an error to be caught by the calling Server Action
        throw new Error('La generación de imagen no devolvió una URL válida o el objeto multimedia estaba malformado.');
      }
      console.log(`[generatePromotionalImageFlow] Image URI received (first 100 chars): ${media.url.substring(0,100)}...`);
      return { imageDataUri: media.url };

    } catch (error: any) {
      console.error('[generatePromotionalImageFlow] Error message from Genkit call:', error.message);
      // Log all properties of the error object for better debugging
      console.error('[generatePromotionalImageFlow] Full error object from Genkit:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      
      // Re-throw the error so the calling Server Action can handle the fallback
      throw new Error(`Error en el flujo Genkit al generar imagen para "${input.brandName}": ${error.message}`);
    }
  }
);

