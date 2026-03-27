import type { DbClient } from "@/lib/db-types";
import { DateTime } from "luxon";
import { shiftWithinAvailability } from "./availability";
import type { AssignmentCheckResult, Violation } from "./types";

const REST_HOURS = 10;
const WEEKLY_WARN_AT = 35;
const DAILY_WARN = 8;
const DAILY_HARD = 12;

export type CheckAssignmentInput = {
  shiftId: string;
  userId: string;
  excludeAssignmentId?: string;
  managerOverrideSeventhDay?: boolean;
  seventhDayReason?: string;
};

function hoursBetween(a: Date, b: Date) {
  return (b.getTime() - a.getTime()) / 3600000;
}

function intervalsOverlap(s1: Date, e1: Date, s2: Date, e2: Date) {
  return s1 < e2 && s2 < e1;
}

/** Calendar dates (YYYY-MM-DD) in zone where user has any assigned shift */
async function assignmentLocalDatesInRange(
  prisma: DbClient,
  userId: string,
  zone: string,
  rangeStartUtc: Date,
  rangeEndUtc: Date,
  excludeAssignmentId?: string,
): Promise<Set<string>> {
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      userId,
      ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
      shift: {
        OR: [
          { startUtc: { lt: rangeEndUtc }, endUtc: { gt: rangeStartUtc } },
          { startUtc: { gte: rangeStartUtc, lte: rangeEndUtc } },
        ],
      },
    },
    include: { shift: true },
  });

  const days = new Set<string>();
  for (const a of assignments) {
    const s = DateTime.fromJSDate(a.shift.startUtc, { zone: "utc" }).setZone(zone);
    const e = DateTime.fromJSDate(a.shift.endUtc, { zone: "utc" }).setZone(zone);
    let cur = s.startOf("day");
    const endDay = e.startOf("day");
    while (cur <= endDay) {
      const iso = cur.toISODate();
      if (iso) days.add(iso);
      cur = cur.plus({ days: 1 });
    }
  }
  return days;
}

export async function validateAssignment(
  prisma: DbClient,
  input: CheckAssignmentInput,
): Promise<AssignmentCheckResult> {
  const warnings: Violation[] = [];
  const violations: Violation[] = [];

  const shift = await prisma.shift.findUnique({
    where: { id: input.shiftId },
    include: { location: true, requiredSkill: true },
  });
  if (!shift) {
    violations.push({ code: "SKILL_MISMATCH", message: "Shift was not found." });
    return { ok: false, violations, warnings };
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: {
      staffProfile: true,
      staffSkills: true,
      staffLocationCerts: true,
      availabilityRecurring: true,
      availabilityExceptions: true,
    },
  });

  if (!user || user.role !== "STAFF" || !user.staffProfile) {
    violations.push({
      code: "SKILL_MISMATCH",
      message: "Only staff with a complete profile can be assigned.",
    });
    return { ok: false, violations, warnings };
  }

  const hasSkill = user.staffSkills.some((s) => s.skillId === shift.requiredSkillId);
  if (!hasSkill) {
    violations.push({
      code: "SKILL_MISMATCH",
      message: `${user.name} does not have the "${shift.requiredSkill.name}" skill required for this shift.`,
      details: { skill: shift.requiredSkill.name },
    });
  }

  const cert = user.staffLocationCerts.find((c) => c.locationId === shift.locationId);
  if (!cert) {
    violations.push({
      code: "LOCATION_CERT_MISSING",
      message: `${user.name} is not certified for ${shift.location.name}.`,
      details: { location: shift.location.name },
    });
  } else if (!cert.active) {
    violations.push({
      code: "LOCATION_CERT_INACTIVE",
      message: `${user.name}'s certification for ${shift.location.name} is inactive (historical shifts stay as-is; new assignments are blocked).`,
      details: { location: shift.location.name },
    });
  }

  const locTz = shift.location.timezone;
  const sUtc = shift.startUtc;
  const eUtc = shift.endUtc;
  const shiftHours = hoursBetween(sUtc, eUtc);

  const otherAssignments = await prisma.shiftAssignment.findMany({
    where: {
      userId: input.userId,
      ...(input.excludeAssignmentId ? { id: { not: input.excludeAssignmentId } } : {}),
    },
    include: { shift: true },
  });

  for (const o of otherAssignments) {
    if (intervalsOverlap(sUtc, eUtc, o.shift.startUtc, o.shift.endUtc)) {
      violations.push({
        code: "DOUBLE_BOOK",
        message: `Double-booking: ${user.name} is already scheduled during this window (overlapping shift).`,
        details: { otherShiftId: o.shiftId },
      });
      break;
    }
    let gapH: number | null = null;
    if (eUtc <= o.shift.startUtc) gapH = hoursBetween(eUtc, o.shift.startUtc);
    else if (o.shift.endUtc <= sUtc) gapH = hoursBetween(o.shift.endUtc, sUtc);
    if (gapH !== null && gapH < REST_HOURS) {
      violations.push({
        code: "REST_WINDOW",
        message: `Less than ${REST_HOURS} hours between shifts for ${user.name} (${gapH.toFixed(1)}h gap).`,
        details: { hoursBetween: gapH, requiredHours: REST_HOURS },
      });
      break;
    }
  }

  const tzAvail = user.staffProfile.availabilityTimezone;
  const recurring = user.availabilityRecurring.map((r) => ({
    dayOfWeek: r.dayOfWeek,
    startMinute: r.startMinute,
    endMinute: r.endMinute,
  }));
  const exceptions = user.availabilityExceptions.map((x) => ({
    date: x.date,
    available: x.available,
    startMinute: x.startMinute,
    endMinute: x.endMinute,
  }));

  if (!shiftWithinAvailability(tzAvail, recurring, exceptions, sUtc, eUtc)) {
    violations.push({
      code: "AVAILABILITY",
      message: `This shift is outside ${user.name}'s saved availability (interpreted in ${tzAvail}).`,
      details: { availabilityTimezone: tzAvail },
    });
  }

  const tStart = DateTime.fromJSDate(sUtc, { zone: "utc" }).setZone(locTz);
  const dayStart = tStart.startOf("day");
  const dayEnd = dayStart.plus({ days: 1 });

  let dailyHours = shiftHours;
  for (const o of otherAssignments) {
    const os = DateTime.fromJSDate(o.shift.startUtc, { zone: "utc" }).setZone(locTz);
    if (os >= dayStart && os < dayEnd) {
      dailyHours += hoursBetween(o.shift.startUtc, o.shift.endUtc);
    }
  }
  if (dailyHours > DAILY_HARD) {
    violations.push({
      code: "DAILY_HOURS_HARD",
      message: `Assignment would put ${user.name} over ${DAILY_HARD} hours in a single day at this location (${dailyHours.toFixed(1)}h).`,
      details: { hours: dailyHours },
    });
  } else if (dailyHours > DAILY_WARN) {
    warnings.push({
      code: "DAILY_HOURS_WARN",
      message: `This assignment pushes ${user.name} to ${dailyHours.toFixed(1)} hours that day (warning above ${DAILY_WARN}h).`,
      details: { hours: dailyHours },
    });
  }

  const weekStart = tStart.set({ weekday: 1 }).startOf("day");
  const weekEnd = weekStart.plus({ weeks: 1 });
  let weeklyHours = shiftHours;
  for (const o of otherAssignments) {
    const ost = DateTime.fromJSDate(o.shift.startUtc, { zone: "utc" }).setZone(locTz);
    if (ost >= weekStart && ost < weekEnd) {
      weeklyHours += hoursBetween(o.shift.startUtc, o.shift.endUtc);
    }
  }
  if (weeklyHours >= WEEKLY_WARN_AT) {
    warnings.push({
      code: "WEEKLY_HOURS_WARN",
      message: `${user.name} is at ${weeklyHours.toFixed(1)}h this workweek (${locTz}, week starting ${weekStart.toISODate()}).`,
      details: { hours: weeklyHours },
    });
  }

  const rangeStart = weekStart.minus({ weeks: 1 }).toUTC().toJSDate();
  const rangeEnd = weekEnd.plus({ weeks: 1 }).toUTC().toJSDate();
  const existingDays = await assignmentLocalDatesInRange(
    prisma,
    input.userId,
    locTz,
    rangeStart,
    rangeEnd,
    input.excludeAssignmentId,
  );
  const newDays = new Set(existingDays);
  let cur = DateTime.fromJSDate(sUtc, { zone: "utc" }).setZone(locTz).startOf("day");
  const lastDay = DateTime.fromJSDate(eUtc, { zone: "utc" }).setZone(locTz).startOf("day");
  while (cur <= lastDay) {
    const iso = cur.toISODate();
    if (iso) newDays.add(iso);
    cur = cur.plus({ days: 1 });
  }

  const sorted = [...newDays].sort();
  let maxStreak = 0;
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = DateTime.fromISO(sorted[i - 1]!);
    const next = DateTime.fromISO(sorted[i]!);
    if (next.diff(prev, "days").days === 1) streak += 1;
    else streak = 1;
    if (streak > maxStreak) maxStreak = streak;
  }
  if (sorted.length === 1) maxStreak = 1;

  if (maxStreak >= 7 && !input.managerOverrideSeventhDay) {
    violations.push({
      code: "CONSECUTIVE_SEVEN_BLOCK",
      message: `This would be a 7th consecutive day for ${user.name}. Manager override with a written reason is required.`,
      details: { consecutiveDays: maxStreak },
    });
  } else if (maxStreak >= 7 && input.managerOverrideSeventhDay && !input.seventhDayReason?.trim()) {
    violations.push({
      code: "CONSECUTIVE_SEVEN_BLOCK",
      message: "Please document a reason for scheduling the 7th consecutive day.",
    });
  } else if (maxStreak === 6) {
    warnings.push({
      code: "CONSECUTIVE_SIX_WARN",
      message: `${user.name} would be working a 6th consecutive day—worth double-checking coverage and fatigue.`,
      details: { consecutiveDays: maxStreak },
    });
  }

  if (violations.length > 0) return { ok: false, violations, warnings };
  return { ok: true, warnings };
}
