
import { config } from 'dotenv';
config();

import '@/ai/flows/route-watcher.ts';
import '@/ai/flows/generate-promo-image-flow.ts'; // Asegurarse de que el nuevo flow esté registrado
