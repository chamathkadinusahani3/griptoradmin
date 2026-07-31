// Single source of truth for the bookable time-slot list — previously
// hardcoded separately in availability.ts (hourly) and duplicated again in
// the frontend's create form (drifted out of sync by construction). 30-min
// increments across business hours with a lunch gap. Deliberately a fixed
// constant, not a per-tenant/per-branch config field, same "not
// configurable yet" philosophy the original hardcoded list already used —
// revisit if a tenant actually needs different hours.
const BUSINESS_START_MINUTES = 9 * 60; // 09:00
const BUSINESS_END_MINUTES = 17 * 60; // 17:00
const LUNCH_START_MINUTES = 12 * 60; // 12:00
const LUNCH_END_MINUTES = 13 * 60; // 13:00
const SLOT_MINUTES = 30;

function toTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let t = BUSINESS_START_MINUTES; t < BUSINESS_END_MINUTES; t += SLOT_MINUTES) {
    if (t >= LUNCH_START_MINUTES && t < LUNCH_END_MINUTES) continue;
    slots.push(toTimeString(t));
  }
  return slots;
})();
