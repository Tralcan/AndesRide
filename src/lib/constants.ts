
export const APP_NAME = "AndesRide";

export const LOCATIONS = [
  "Bogotá",
  "Medellín",
  "Cali",
  "Barranquilla",
  "Cartagena",
  "Cúcuta",
  "Bucaramanga",
  "Pereira",
  "Santa Marta",
  "Ibagué",
] as const;

export type Location = typeof LOCATIONS[number];

export const ROLES = {
  DRIVER: "conductor",
  PASSENGER: "pasajero",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES] | null;

export const DEFAULT_USER_EMAIL = "testuser@example.com";
