import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getManagerLocationIds } from "@/lib/access";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId") ?? undefined;

  const include = {
    fromUser: { select: { id: true, name: true } },
    toUser: { select: { id: true, name: true } },
    assignment: {
      include: {
        shift: { include: { location: true, requiredSkill: true } },
      },
    },
  } as const;

  if (session.role === "STAFF") {
    const rows = await prisma.coverageRequest.findMany({
      where: {
        OR: [{ fromUserId: session.sub }, { toUserId: session.sub }],
      },
      include,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ requests: rows });
  }

  let shiftWhere: Prisma.ShiftWhereInput = {};
  if (session.role === "MANAGER") {
    const ids = await getManagerLocationIds(session.sub);
    if (locationId) {
      if (!ids.includes(locationId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      shiftWhere = { locationId };
    } else {
      shiftWhere = { locationId: { in: ids } };
    }
  } else if (session.role === "ADMIN" && locationId) {
    shiftWhere = { locationId };
  }

  const where: Prisma.CoverageRequestWhereInput =
    Object.keys(shiftWhere).length > 0
      ? { assignment: { shift: shiftWhere } }
      : {};

  const rows = await prisma.coverageRequest.findMany({
    where,
    include,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ requests: rows });
}
