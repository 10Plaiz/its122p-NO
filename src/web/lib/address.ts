export function composeAddress(house: string, street: string): string {
  return [house.trim(), street.trim()].filter(Boolean).join(" ");
}
