// Frontend mirror of api/_lib/plate.ts — kept in sync manually (small,
// stable rule, not worth sharing a module across the frontend/backend
// build boundary). See that file for the format rationale.
const PLATE_REGEX = /^([A-Z]{2}\s)?[A-Z]{2,3}[\s-]?\d{4}$/;

export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/\s+/g, ' ').trim();
}

export function isValidSriLankanPlate(input: string): boolean {
  return PLATE_REGEX.test(normalizePlate(input));
}
