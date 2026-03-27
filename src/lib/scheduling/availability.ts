import { DateTime } from "luxon";

type Recurring = { dayOfWeek: number; startMinute: number; endMinute: number };
type Exception = {
  date: Date;
  available: boolean;
  startMinute: number | null;
  endMinute: number | null;
};

/** Build UTC intervals where the staff member is available (union of windows in [rangeStart, rangeEnd]). */
export function availabilityUtcIntervals(
  staffTz: string,
  recurring: Recurring[],
  exceptions: Exception[],
  rangeStartUtc: Date,
  rangeEndUtc: Date,
): { startUtc: Date; endUtc: Date }[] {
  const rangeStart = DateTime.fromJSDate(rangeStartUtc, { zone: "utc" });
  const rangeEnd = DateTime.fromJSDate(rangeEndUtc, { zone: "utc" });
  const startLocal = rangeStart.setZone(staffTz).startOf("day").minus({ days: 1 });
  const endLocal = rangeEnd.setZone(staffTz).endOf("day").plus({ days: 1 });

  const exceptionMap = new Map<string, Exception>();
  for (const ex of exceptions) {
    const key = DateTime.fromJSDate(ex.date, { zone: "utc" }).toISODate();
    if (key) exceptionMap.set(key, ex);
  }

  const intervals: { startUtc: Date; endUtc: Date }[] = [];

  for (let cursor = startLocal; cursor <= endLocal; cursor = cursor.plus({ days: 1 })) {
    const isoDate = cursor.toISODate();
    if (!isoDate) continue;
    const luxDow = cursor.weekday; // 1 Monday … 7 Sunday
    const dayOfWeekSun0 = luxDow === 7 ? 0 : luxDow;

    const ex = exceptionMap.get(isoDate);
    if (ex && !ex.available) continue;
    if (ex && ex.available && ex.startMinute != null && ex.endMinute != null) {
      const start = cursor.startOf("day").plus({ minutes: ex.startMinute });
      let end = cursor.startOf("day").plus({ minutes: ex.endMinute });
      if (end <= start) end = end.plus({ days: 1 });
      intervals.push({ startUtc: start.toUTC().toJSDate(), endUtc: end.toUTC().toJSDate() });
      continue;
    }

    for (const rule of recurring) {
      if (rule.dayOfWeek !== dayOfWeekSun0) continue;
      const start = cursor.startOf("day").plus({ minutes: rule.startMinute });
      let end = cursor.startOf("day").plus({ minutes: rule.endMinute });
      if (end <= start) end = end.plus({ days: 1 });
      intervals.push({ startUtc: start.toUTC().toJSDate(), endUtc: end.toUTC().toJSDate() });
    }
  }

  intervals.sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
  return mergeIntervals(intervals);
}

function mergeIntervals(intervals: { startUtc: Date; endUtc: Date }[]) {
  if (intervals.length === 0) return [];
  const out: { startUtc: Date; endUtc: Date }[] = [];
  let cur = { ...intervals[0] };
  for (let i = 1; i < intervals.length; i++) {
    const n = intervals[i];
    if (n.startUtc.getTime() <= cur.endUtc.getTime()) {
      cur.endUtc = n.endUtc > cur.endUtc ? n.endUtc : cur.endUtc;
    } else {
      out.push(cur);
      cur = { ...n };
    }
  }
  out.push(cur);
  return out;
}

/** True if [shiftStart, shiftEnd] is fully covered by the union of availability intervals. */
export function shiftWithinAvailability(
  staffTz: string,
  recurring: Recurring[],
  exceptions: Exception[],
  shiftStartUtc: Date,
  shiftEndUtc: Date,
): boolean {
  const intervals = availabilityUtcIntervals(staffTz, recurring, exceptions, shiftStartUtc, shiftEndUtc);
  const s = shiftStartUtc.getTime();
  const e = shiftEndUtc.getTime();
  if (intervals.length === 0) return false;
  let remainingStart = s;
  for (const iv of intervals) {
    const is = iv.startUtc.getTime();
    const ie = iv.endUtc.getTime();
    if (ie <= remainingStart) continue;
    if (is > remainingStart) return false;
    if (ie >= e) return true;
    remainingStart = ie;
  }
  return remainingStart >= e;
}
