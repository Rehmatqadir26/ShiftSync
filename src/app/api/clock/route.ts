import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime/bus";
import { DateTime } from "luxon";

const bodySchema = z.object({
  assignmentId: z.string(),
  action: z.enum(["in", "out"]),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "STAFF") {
    return NextResponse.json({ error: "Staff clock-in only in demo" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const a = await prisma.shiftAssignment.findUnique({
    where: { id: parsed.data.assignmentId },
    include: { shift: { include: { location: true } } },
  });
  if (!a || a.userId !== session.sub) {
    return NextResponse.json({ error: "Not your assignment" }, { status: 403 });
  }

  const now = DateTime.now().toUTC().toJSDate();
  const zone = a.shift.location.timezone;
  const start = DateTime.fromJSDate(a.shift.startUtc, { zone: "utc" }).setZone(zone).minus({ minutes: 30 });
  const end = DateTime.fromJSDate(a.shift.endUtc, { zone: "utc" }).setZone(zone).plus({ minutes: 30 });
  const nowLocal = DateTime.now().setZone(zone);
  if (nowLocal < start || nowLocal > end) {
    return NextResponse.json(
      { error: "Clock only allowed within a short window around the scheduled shift." },
      { status: 400 },
    );
  }

  if (parsed.data.action === "in") {
    const open = await prisma.clockEvent.findFirst({
      where: { assignmentId: a.id, clockOutUtc: null },
    });
    if (open) return NextResponse.json({ error: "Already clocked in" }, { status: 400 });
    const ev = await prisma.clockEvent.create({
      data: { userId: session.sub, assignmentId: a.id, clockInUtc: now },
    });
    emitRealtime({ type: "on_duty", locationId: a.shift.locationId, payload: ev });
    return NextResponse.json({ event: ev });
  }

  const open = await prisma.clockEvent.findFirst({
    where: { assignmentId: a.id, clockOutUtc: null },
    orderBy: { clockInUtc: "desc" },
  });
  if (!open) return NextResponse.json({ error: "Not clocked in" }, { status: 400 });
  const ev = await prisma.clockEvent.update({
    where: { id: open.id },
    data: { clockOutUtc: now },
  });
  emitRealtime({ type: "on_duty", locationId: a.shift.locationId, payload: ev });
  return NextResponse.json({ event: ev });
}
