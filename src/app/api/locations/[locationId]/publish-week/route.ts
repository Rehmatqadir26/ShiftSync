import { NextResponse } from "next/server";
import { z } from "zod";
import { getManagerLocationIds } from "@/lib/access";
import { getSession } from "@/lib/auth/session";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime/bus";
import { weekMondayInZone } from "@/lib/scheduling/publish";

const bodySchema = z.object({
  referenceUtc: z.string().datetime(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ locationId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "STAFF") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { locationId } = await ctx.params;
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Need referenceUtc (ISO)" }, { status: 400 });

  const loc = await prisma.location.findUnique({ where: { id: locationId } });
  if (!loc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (session.role === "MANAGER") {
    const ids = await getManagerLocationIds(session.sub);
    if (!ids.includes(locationId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const monday = weekMondayInZone(new Date(parsed.data.referenceUtc), loc.timezone);

  const pub = await prisma.publishedWeek.upsert({
    where: { locationId_weekMonday: { locationId, weekMonday: monday } },
    create: { locationId, weekMonday: monday, publishedBy: session.sub },
    update: { publishedBy: session.sub, publishedAt: new Date() },
  });

  const staff = await prisma.staffLocationCert.findMany({
    where: { locationId, active: true },
    select: { userId: true },
  });

  for (const s of staff) {
    await notifyUser({
      userId: s.userId,
      type: "SCHEDULE_PUBLISHED",
      title: "Schedule published",
      body: `The schedule for ${loc.name} week of ${pub.weekMonday.toISOString().slice(0, 10)} is live.`,
      data: { locationId, weekMonday: monday },
    });
  }

  emitRealtime({ type: "schedule_updated", locationId, payload: { publishedWeek: pub.id } });

  return NextResponse.json({ published: pub });
}
