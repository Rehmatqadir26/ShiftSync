import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const windowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(24 * 60 - 1),
  endMinute: z.number().int().min(1).max(24 * 60),
});

const putSchema = z.object({
  windows: z.array(windowSchema),
});

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "STAFF") {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  for (const w of parsed.data.windows) {
    if (w.startMinute >= w.endMinute) {
      return NextResponse.json(
        { error: `Invalid window on day ${w.dayOfWeek}: end must be after start` },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.availabilityRecurring.deleteMany({ where: { userId: session.sub } });
    for (const w of parsed.data.windows) {
      await tx.availabilityRecurring.create({
        data: {
          userId: session.sub,
          dayOfWeek: w.dayOfWeek,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
        },
      });
    }
  });

  const recurring = await prisma.availabilityRecurring.findMany({
    where: { userId: session.sub },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });

  return NextResponse.json({ recurring });
}
