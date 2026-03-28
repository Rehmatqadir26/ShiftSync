import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/** Log of emails we would have sent when “email simulation” is enabled. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.simulatedEmail.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ emails: rows });
}
