import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { getManagerLocationIds } from "@/lib/access";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "STAFF") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId");
  const reference = searchParams.get("reference");
  if (!locationId || !reference) {
    return NextResponse.json({ error: "locationId and reference (ISO instant) required" }, { status: 400 });
  }

  if (session.role === "MANAGER") {
    const ids = await getManagerLocationIds(session.sub);
    if (!ids.includes(locationId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const loc = await prisma.location.findUnique({ where: { id: locationId } });
  if (!loc) return NextResponse.json({ error: "Unknown location" }, { status: 404 });

  const ref = DateTime.fromISO(reference, { zone: "utc" }).setZone(loc.timezone);
  if (!ref.isValid) return NextResponse.json({ error: "Bad reference" }, { status: 400 });
  const weekStart = ref.set({ weekday: 1 }).startOf("day");
  const weekEnd = weekStart.plus({ weeks: 1 });

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      shift: {
        locationId,
        startUtc: { gte: weekStart.toUTC().toJSDate(), lt: weekEnd.toUTC().toJSDate() },
      },
    },
    include: {
      user: { include: { staffProfile: true } },
      shift: true,
    },
  });

  const byUser = new Map<
    string,
    { name: string; hours: number; rateCents: number; assignments: { id: string; hours: number; label: string }[] }
  >();

  for (const a of assignments) {
    const h = (a.shift.endUtc.getTime() - a.shift.startUtc.getTime()) / 3600000;
    const rate = a.user.staffProfile?.hourlyRateCents ?? 2000;
    const cur = byUser.get(a.userId) ?? {
      name: a.user.name,
      hours: 0,
      rateCents: rate,
      assignments: [],
    };
    cur.hours += h;
    cur.assignments.push({
      id: a.id,
      hours: h,
      label: `${DateTime.fromJSDate(a.shift.startUtc).setZone(loc.timezone).toFormat("ccc LLL d ha")}`,
    });
    byUser.set(a.userId, cur);
  }

  const staff = [...byUser.values()].map((row) => {
    const ot = Math.max(0, row.hours - 40);
    const otCost = (ot * row.rateCents * 1.5) / 100;
    return {
      name: row.name,
      weeklyHours: Math.round(row.hours * 100) / 100,
      projectedOtHours: Math.round(ot * 100) / 100,
      projectedOtCostUsd: Math.round(otCost * 100) / 100,
      drivers: row.assignments.sort((a, b) => b.hours - a.hours).slice(0, 5),
    };
  });

  return NextResponse.json({
    weekLabel: `${weekStart.toISODate()} – ${weekEnd.minus({ days: 1 }).toISODate()} (${loc.timezone})`,
    staff: staff.sort((a, b) => b.weeklyHours - a.weeklyHours),
    note: "OT estimate: hours beyond 40 × 1.5 × hourly rate from profile.",
  });
}
