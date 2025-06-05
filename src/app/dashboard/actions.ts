
// src/app/dashboard/actions.ts
'use server';

import { supabase } from '@/lib/supabaseClient';
import { generatePromotionalImageForBrand, type GeneratePromotionalImageInput } from '@/ai/flows/generate-promo-image-flow';

interface BrandFromSupabase {
  id: string;
  nombre: string;
  imagen_logo_url: string | null;
  texto_promocion: string | null;
  prompt_ia: string | null;
  porcentaje_aparicion: number;
}

async function getActiveBrands(): Promise<BrandFromSupabase[]> {
  const { data, error } = await supabase
    .from('marcas')
    .select('id, nombre, imagen_logo_url, texto_promocion, prompt_ia, porcentaje_aparicion')
    .eq('estado', true);
  if (error) {
    console.error("Error fetching active brands:", error);
    // En un caso real, podrías querer lanzar el error o manejarlo de forma más específica.
    // Por ahora, devolvemos un array vacío para que el flujo pueda continuar con fallbacks.
    return [];
  }
  return data || [];
}

function selectWeightedRandomBrand(brands: BrandFromSupabase[]): BrandFromSupabase | null {
  if (!brands || brands.length === 0) return null;

  const totalWeight = brands.reduce((sum, brand) => sum + (brand.porcentaje_aparicion || 0), 0);
  
  if (totalWeight <= 0) {
    // Si todos los pesos son 0 o negativos, o no hay marcas con peso positivo,
    // selecciona una marca al azar de forma simple.
    return brands[Math.floor(Math.random() * brands.length)];
  }

  let randomNum = Math.random() * totalWeight;
  for (const brand of brands) {
    if (randomNum < (brand.porcentaje_aparicion || 0)) {
      return brand;
    }
    randomNum -= (brand.porcentaje_aparicion || 0);
  }
  // Fallback en caso de errores de redondeo flotante (aunque poco probable con esta lógica),
  // o si algo sale mal, devuelve la última marca o una al azar.
  return brands[brands.length - 1]; 
}

export interface PromoDisplayData {
  generatedImageUri: string;
  brandName: string;
  brandLogoUrl: string | null;
  promoText: string | null;
  hasError?: boolean;
}

const FALLBACK_PROMO_DATA: PromoDisplayData = {
  generatedImageUri: 'https://placehold.co/1200x400.png?text=AndesRide',
  brandName: 'AndesRide',
  brandLogoUrl: null, // Podrías tener un logo de AndesRide por defecto aquí
  promoText: 'Tu compañero de viaje ideal en la región andina.',
  hasError: true,
};

export async function getDashboardPromoData(): Promise<PromoDisplayData> {
  try {
    const brands = await getActiveBrands();
    if (!brands || brands.length === 0) {
      console.warn("No active brands found in Supabase. Returning fallback promo data.");
      return FALLBACK_PROMO_DATA;
    }

    const selectedBrand = selectWeightedRandomBrand(brands);
    if (!selectedBrand) {
      console.warn("Could not select a brand using weighted random. Returning fallback promo data.");
      return FALLBACK_PROMO_DATA;
    }

    const genkitInput: GeneratePromotionalImageInput = {
      brandName: selectedBrand.nombre,
      customPrompt: selectedBrand.prompt_ia || undefined,
    };

    console.log(`[actions.ts] Requesting image for brand: ${selectedBrand.nombre}`);
    const imageResult = await generatePromotionalImageForBrand(genkitInput);
    console.log(`[actions.ts] Image URI received: ${imageResult.imageDataUri.substring(0,50)}...`);


    return {
      generatedImageUri: imageResult.imageDataUri,
      brandName: selectedBrand.nombre,
      brandLogoUrl: selectedBrand.imagen_logo_url,
      promoText: selectedBrand.texto_promocion,
    };

  } catch (error) {
    console.error("Error in getDashboardPromoData:", error);
    return { ...FALLBACK_PROMO_DATA, hasError: true }; // Devuelve fallback con indicador de error
  }
}

