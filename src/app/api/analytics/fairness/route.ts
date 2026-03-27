import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { getManagerLocationIds } from "@/lib/access";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { isPremiumShift } from "@/lib/scheduling/premium";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "STAFF") {
    return NextResponse.json({ error: "Managers or admins" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId");
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!locationId || !start || !end) {
    return NextResponse.json({ error: "locationId, start, end (ISO) required" }, { status: 400 });
  }

  if (session.role === "MANAGER") {
    const ids = await getManagerLocationIds(session.sub);
    if (!ids.includes(locationId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const loc = await prisma.location.findUnique({ where: { id: locationId } });
  if (!loc) return NextResponse.json({ error: "Unknown location" }, { status: 404 });

  const startDt = DateTime.fromISO(start, { zone: "utc" });
  const endDt = DateTime.fromISO(end, { zone: "utc" });
  if (!startDt.isValid || !endDt.isValid) {
    return NextResponse.json({ error: "Bad date range" }, { status: 400 });
  }

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      shift: {
        locationId,
        startUtc: { gte: startDt.toJSDate(), lte: endDt.toJSDate() },
      },
    },
    include: {
      user: { include: { staffProfile: true } },
      shift: true,
    },
  });

  const hours = new Map<string, { name: string; totalHours: number; premiumHours: number; desired: number }>();
  for (const a of assignments) {
    const h =
      (a.shift.endUtc.getTime() - a.shift.startUtc.getTime()) / 3600000;
    const prem = isPremiumShift(a.shift.startUtc, loc.timezone);
    const cur = hours.get(a.userId) ?? {
      name: a.user.name,
      totalHours: 0,
      premiumHours: 0,
      desired: a.user.staffProfile?.desiredHoursWeekly ?? 0,
    };
    cur.totalHours += h;
    if (prem) cur.premiumHours += h;
    hours.set(a.userId, cur);
  }

  const rows = [...hours.entries()].map(([userId, v]) => ({
    userId,
    ...v,
    deltaVersusDesired: v.totalHours - v.desired,
  }));

  const premTotals = rows.map((r) => r.premiumHours);
  const meanPrem = premTotals.reduce((s, x) => s + x, 0) / (premTotals.length || 1);
  const variance =
    premTotals.reduce((s, x) => s + (x - meanPrem) ** 2, 0) / (premTotals.length || 1);
  const fairnessScore = Math.max(0, 100 - Math.sqrt(variance) * 10);
  return NextResponse.json({
    location: loc.name,
    period: { start, end },
    staff: rows.sort((a, b) => a.name.localeCompare(b.name)),
    fairnessScore: Math.round(fairnessScore * 10) / 10,
    note: "Premium = Fri/Sat after 5pm local. Score is a simple spread heuristic (higher is more even).",
  });
}
