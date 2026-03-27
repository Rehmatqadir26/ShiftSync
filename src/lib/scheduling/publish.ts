import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";

export function weekMondayInZone(dateUtc: Date, zone: string): Date {
  const local = DateTime.fromJSDate(dateUtc, { zone: "utc" }).setZone(zone);
  const monday = local.set({ weekday: 1 }).startOf("day");
  return monday.toUTC().toJSDate();
}

export async function isPublishedForShift(shiftId: string): Promise<boolean> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { location: true },
  });
  if (!shift) return false;
  const monday = weekMondayInZone(shift.startUtc, shift.location.timezone);
  const pub = await prisma.publishedWeek.findUnique({
    where: {
      locationId_weekMonday: { locationId: shift.locationId, weekMonday: monday },
    },
  });
  return !!pub;
}

export async function assertEditAllowed(shiftId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const settings = await prisma.organizationSettings.findUnique({ where: { id: "singleton" } });
  const hoursBefore = settings?.editCutoffHoursBefore ?? 48;

  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) return { ok: false, message: "Shift not found" };
  const cutoff = DateTime.fromJSDate(shift.startUtc, { zone: "utc" }).minus({ hours: hoursBefore });
  if (DateTime.now() > cutoff) {
    return {
      ok: false,
      message: `Edits are blocked within ${hoursBefore} hours of shift start.`,
    };
  }
  return { ok: true };
}
