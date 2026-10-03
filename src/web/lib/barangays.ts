// Makati's 23 barangays after the 2023 transfer of the ten EMBO barangays to
// Taguig. Mirrored by BARANGAYS in src/server/lib/validate.ts and by the check on
// profiles.barangay in 20261003000200_accounts.sql.
export const BARANGAYS = [
  "Bangkal",
  "Bel-Air",
  "Carmona",
  "Dasmariñas",
  "Forbes Park",
  "Guadalupe Nuevo",
  "Guadalupe Viejo",
  "Kasilawan",
  "La Paz",
  "Magallanes",
  "Olympia",
  "Palanan",
  "Pinagkaisahan",
  "Pio del Pilar",
  "Poblacion",
  "San Antonio",
  "San Isidro",
  "San Lorenzo",
  "Santa Cruz",
  "Singkamas",
  "Tejeros",
  "Urdaneta",
  "Valenzuela",
] as const;
export const BARANGAY_ERROR = "Choose your barangay in Makati.";

export const ADDRESS_MAX = 200;
export const ADDRESS_MIN_ERROR = "Enter your house number and street.";
export const ADDRESS_MAX_ERROR = "Keep the address under 200 characters.";

export function validateAddressLine(value: string): string | undefined {
  const address = value.trim();
  if (address.length < 5) return ADDRESS_MIN_ERROR;
  if (address.length > ADDRESS_MAX) return ADDRESS_MAX_ERROR;
  return undefined;
}
