/**
 * Suggests a vehicle type for a given delivery load, from the tenant's own
 * configurable rules (Client.deliveryLoadRules) — never a hard-coded
 * threshold table. Returns null when there are no rules configured, or when
 * the load exceeds every configured rule (the caller should surface that as
 * "no vehicle type covers this load", not silently pick the largest).
 */
export function suggestVehicleType(totalVolume: number, rules: { maxVolume: number; vehicleType: string }[]): string | null {
  if (totalVolume <= 0 || rules.length === 0) return null;
  const sorted = [...rules].sort((a, b) => a.maxVolume - b.maxVolume);
  const match = sorted.find((r) => totalVolume <= r.maxVolume);
  return match?.vehicleType ?? null;
}
