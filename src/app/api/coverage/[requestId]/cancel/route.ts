import { CoverageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ requestId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { requestId } = await ctx.params;
  const row = await prisma.coverageRequest.findUnique({
    where: { id: requestId },
    include: { assignment: { include: { shift: true } } },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.fromUserId !== session.sub) {
    return NextResponse.json({ error: "Only the requester can cancel" }, { status: 403 });
  }
  if (row.status !== CoverageStatus.AWAITING_PEER) {
    return NextResponse.json({ error: "Too late to cancel here—ask a manager." }, { status: 400 });
  }

  await prisma.coverageRequest.update({
    where: { id: requestId },
    data: { status: CoverageStatus.CANCELLED },
  });

  if (row.toUserId) {
    await notifyUser({
      userId: row.toUserId,
      type: "SWAP_UPDATE",
      title: "Swap cancelled",
      body: `${session.name} withdrew the request.`,
      data: { coverageRequestId: requestId },
    });
  }

  return NextResponse.json({ ok: true });
}
