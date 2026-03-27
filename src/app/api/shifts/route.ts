import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { canAccessLocation, getManagerLocationIds } from "@/lib/access";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { isPublishedForShift } from "@/lib/scheduling/publish";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId") ?? undefined;

  const where: Prisma.ShiftWhereInput = {};
  if (locationId) where.locationId = locationId;

  if (session.role === "MANAGER") {
    const ids = await getManagerLocationIds(session.sub);
    where.locationId = locationId ? (ids.includes(locationId) ? locationId : "__none__") : { in: ids };
  } else if (session.role === "STAFF") {
    if (locationId) {
      const ok = await canAccessLocation(session, locationId);
      if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const certs = await prisma.staffLocationCert.findMany({
      where: { userId: session.sub, active: true },
      select: { locationId: true },
    });
    const locs = certs.map((c) => c.locationId);
    where.locationId = locationId ? (locs.includes(locationId) ? locationId : "__none__") : { in: locs };
  }

  const shifts = await prisma.shift.findMany({
    where,
    orderBy: { startUtc: "asc" },
    include: {
      location: true,
      requiredSkill: true,
      assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
    take: 200,
  });

  const filtered =
    session.role === "STAFF"
      ? await filterStaffVisibleShifts(shifts, session.sub)
      : shifts;

  const withDisplay = filtered.map((s) => ({
    ...s,
    displayStart: DateTime.fromJSDate(s.startUtc, { zone: "utc" })
      .setZone(s.location.timezone)
      .toISO(),
    displayEnd: DateTime.fromJSDate(s.endUtc, { zone: "utc" })
      .setZone(s.location.timezone)
      .toISO(),
    published: null as boolean | null,
  }));

  for (const row of withDisplay) {
    row.published = await isPublishedForShift(row.id);
  }

  return NextResponse.json({ shifts: withDisplay });
}

async function filterStaffVisibleShifts<
  T extends { id: string; assignments: { userId: string }[]; locationId: string },
>(shifts: T[], userId: string) {
  const out: T[] = [];
  for (const s of shifts) {
    const mine = s.assignments.some((a) => a.userId === userId);
    const pub = await isPublishedForShift(s.id);
    if (mine || pub) out.push(s);
  }
  return out;
}
