import type { SessionPayload } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function getManagerLocationIds(userId: string): Promise<string[]> {
  const rows = await prisma.managerLocation.findMany({
    where: { userId },
    select: { locationId: true },
  });
  return rows.map((r) => r.locationId);
}

export async function canAccessLocation(session: SessionPayload, locationId: string): Promise<boolean> {
  if (session.role === "ADMIN") return true;
  if (session.role === "MANAGER") {
    const ids = await getManagerLocationIds(session.sub);
    return ids.includes(locationId);
  }
  const cert = await prisma.staffLocationCert.findUnique({
    where: { userId_locationId: { userId: session.sub, locationId } },
  });
  return !!cert?.active;
}
