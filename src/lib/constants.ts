
export const APP_NAME = "AndesRide";

// LOCATIONS array and Location type are removed as they are now fetched dynamically.

export const ROLES = {
  DRIVER: "conductor",
  PASSENGER: "pasajero",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES] | null;

// DEFAULT_USER_EMAIL ya no es necesario con Supabase Auth
// export const DEFAULT_USER_EMAIL = "testuser@example.com";

    