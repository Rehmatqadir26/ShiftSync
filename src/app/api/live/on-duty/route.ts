import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { DateTime } from "luxon";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId") ?? undefined;

  const now = DateTime.now().toUTC().toJSDate();
  const open = await prisma.clockEvent.findMany({
    where: {
      clockOutUtc: null,
      ...(locationId ? { assignment: { shift: { locationId } } } : {}),
    },
    include: {
      user: { select: { id: true, name: true } },
      assignment: {
        include: { shift: { include: { location: true } } },
      },
    },
    take: 100,
  });

  return NextResponse.json({
    now: now.toISOString(),
    onDuty: open.map((e) => ({
      id: e.id,
      user: e.user,
      location: e.assignment.shift.location,
      clockInUtc: e.clockInUtc.toISOString(),
      shiftStart: e.assignment.shift.startUtc.toISOString(),
      shiftEnd: e.assignment.shift.endUtc.toISOString(),
    })),
  });
}
