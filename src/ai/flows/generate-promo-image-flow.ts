
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
  promoText: z.string().optional().describe('Optional promotional text to overlay or integrate into the image as a sticker or highlight.'),
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
    let promptText = input.customPrompt || `Una imagen de banner promocional vibrante y atractiva para la marca "${input.brandName}", con temática de viajes y aventura en la región andina. Dimensiones ideales 1200x400. Estilo moderno, limpio y que invite a la acción.`;

    if (input.promoText) {
      promptText += ` Incorpora el siguiente texto promocional de forma destacada en la imagen, como un sticker, banner o superposición de texto elegante y legible: "${input.promoText}". Asegúrate de que el texto sea claramente visible y se integre bien con el diseño general de la imagen promocional.`;
    }
    
    console.log(`[generatePromotionalImageFlow] Prompt para Genkit: ${promptText}`);

    try {
      const {media} = await ai.generate({
        model: 'googleai/gemini-2.0-flash-exp', // Crucial: Model con capacidad de generación de imágenes
        prompt: promptText,
        config: {
          responseModalities: ['TEXT', 'IMAGE'], // Debe incluir IMAGE
          // Puedes añadir safetySettings si es necesario, copiando de otros flows.
        },
      });

      if (!media?.url) {
        console.error('[generatePromotionalImageFlow] Image generation did not return a valid media URL. Media object:', media);
        throw new Error('Image generation did not return a valid media URL.');
      }
      console.log(`[generatePromotionalImageFlow] Image URI received: ${media.url.substring(0,100)}...`);
      return { imageDataUri: media.url };

    } catch (error: any) {
      console.error('[generatePromotionalImageFlow] Error generando imagen promocional con Genkit:', error);
      // Fallback a una imagen placeholder en caso de error
      const fallbackImageDataUri = 'https://placehold.co/1200x400.png?text=Error+Generando+Imagen';
      return { imageDataUri: fallbackImageDataUri };
    }
  }
);

