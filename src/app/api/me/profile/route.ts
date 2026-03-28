import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "STAFF") {
    return NextResponse.json({ error: "Staff profile only" }, { status: 403 });
  }

  const profile = await prisma.staffProfile.upsert({
    where: { userId: session.sub },
    create: { userId: session.sub },
    update: {},
  });

  const recurring = await prisma.availabilityRecurring.findMany({
    where: { userId: session.sub },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });

  return NextResponse.json({ profile, recurring });
}

const patchSchema = z.object({
  desiredHoursWeekly: z.number().min(0).max(80).optional(),
  availabilityTimezone: z.string().min(3).max(64).optional(),
  hourlyRateCents: z.number().int().min(0).max(500_00).optional(),
});

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "STAFF") {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await prisma.staffProfile.upsert({
    where: { userId: session.sub },
    create: {
      userId: session.sub,
      ...parsed.data,
    },
    update: parsed.data,
  });

  const profile = await prisma.staffProfile.findUniqueOrThrow({
    where: { userId: session.sub },
  });
  const recurring = await prisma.availabilityRecurring.findMany({
    where: { userId: session.sub },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });

  return NextResponse.json({ profile, recurring });
}
