import { NextResponse } from "next/server";
import { getManagerLocationIds } from "@/lib/access";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role === "ADMIN") {
    const locs = await prisma.location.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ locations: locs });
  }

  if (session.role === "MANAGER") {
    const ids = await getManagerLocationIds(session.sub);
    const locs = await prisma.location.findMany({
      where: { id: { in: ids } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ locations: locs });
  }

  const certs = await prisma.staffLocationCert.findMany({
    where: { userId: session.sub, active: true },
    select: { locationId: true },
  });
  const locs = await prisma.location.findMany({
    where: { id: { in: certs.map((c) => c.locationId) } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ locations: locs });
}
