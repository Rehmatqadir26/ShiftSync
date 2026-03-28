import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const result = await prisma.notification.updateMany({
    where: { userId: session.sub, readAt: null },
    data: { readAt: now },
  });

  return NextResponse.json({ markedRead: result.count });
}
