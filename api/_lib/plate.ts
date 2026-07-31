// Sri Lankan vehicle plate handling. Both formats are still in real
// circulation, so validation accepts either rather than guessing which one
// a given tenant's customers have:
//   - pre-2014 format:      "ABC-1234" / "AB-1234" (2-3 letters, 4 digits)
//   - current provincial:   "WP CAB-1234" (2-letter province + 2-3 letters + 4 digits)
// The separator between the letters and digits (and between province and
// letters) is optional and may be a space or a dash — this is deliberately
// permissive (a false accept just lets an unusual-but-real plate through; a
// false reject blocks a real booking, which is the worse failure mode).
const PLATE_REGEX = /^([A-Z]{2}\s)?[A-Z]{2,3}[\s-]?\d{4}$/;

export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/\s+/g, ' ').trim();
}

export function isValidSriLankanPlate(input: string): boolean {
  return PLATE_REGEX.test(normalizePlate(input));
}
