import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DateTime } from "luxon";
import { canAccessLocation, getManagerLocationIds } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime/bus";
import { isPublishedForShift } from "@/lib/scheduling/publish";

const createBodySchema = z.object({
  locationId: z.string(),
  startUtc: z.string().datetime(),
  endUtc: z.string().datetime(),
  requiredSkillId: z.string(),
  headcount: z.number().int().min(1).max(99).optional().default(1),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "STAFF") {
    return NextResponse.json({ error: "Managers and admins only" }, { status: 403 });
  }

  const parsed = createBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { locationId, requiredSkillId, headcount, notes } = parsed.data;
  const startUtc = new Date(parsed.data.startUtc);
  const endUtc = new Date(parsed.data.endUtc);

  if (endUtc <= startUtc) {
    return NextResponse.json({ error: "endUtc must be after startUtc" }, { status: 400 });
  }

  const loc = await prisma.location.findUnique({ where: { id: locationId } });
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  if (session.role === "MANAGER") {
    const ids = await getManagerLocationIds(session.sub);
    if (!ids.includes(locationId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const skill = await prisma.skill.findUnique({ where: { id: requiredSkillId } });
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

  const shift = await prisma.shift.create({
    data: {
      locationId,
      startUtc,
      endUtc,
      requiredSkillId,
      headcount,
      notes: notes ?? null,
    },
    include: {
      location: true,
      requiredSkill: true,
      assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  await logAudit({
    actorId: session.sub,
    entityType: "Shift",
    entityId: shift.id,
    action: "CREATE",
    after: {
      locationId,
      startUtc: shift.startUtc.toISOString(),
      endUtc: shift.endUtc.toISOString(),
      requiredSkillId,
      headcount,
      notes: shift.notes,
    },
  });

  emitRealtime({ type: "schedule_updated", locationId, payload: { shiftId: shift.id } });

  const displayStart = DateTime.fromJSDate(shift.startUtc, { zone: "utc" })
    .setZone(shift.location.timezone)
    .toISO();
  const displayEnd = DateTime.fromJSDate(shift.endUtc, { zone: "utc" })
    .setZone(shift.location.timezone)
    .toISO();

  return NextResponse.json({
    shift: {
      ...shift,
      displayStart,
      displayEnd,
      published: await isPublishedForShift(shift.id),
    },
  });
}

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
