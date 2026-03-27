import { DateTime } from "luxon";

/** Friday/Saturday evening shifts count as "premium" for fairness analytics. */
export function isPremiumShift(startUtc: Date, locationTz: string): boolean {
  const local = DateTime.fromJSDate(startUtc, { zone: "utc" }).setZone(locationTz);
  const dow = local.weekday; // 5=Fri 6=Sat
  const hour = local.hour;
  if (dow === 5 || dow === 6) {
    if (hour >= 17) return true;
  }
  return false;
}
