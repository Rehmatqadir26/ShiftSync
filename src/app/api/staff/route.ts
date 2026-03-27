import { NextResponse } from "next/server";
import { getManagerLocationIds } from "@/lib/access";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/** Staff certified for a location (for assignment picker). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "STAFF") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId");
  if (!locationId) return NextResponse.json({ error: "locationId required" }, { status: 400 });

  if (session.role === "MANAGER") {
    const ids = await getManagerLocationIds(session.sub);
    if (!ids.includes(locationId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: {
      role: "STAFF",
      staffLocationCerts: { some: { locationId, active: true } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      staffSkills: { select: { skill: { select: { id: true, name: true } } } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ staff: users });
}
