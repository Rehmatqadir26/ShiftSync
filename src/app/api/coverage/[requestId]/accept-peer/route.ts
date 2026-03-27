import { CoverageKind, CoverageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { validateAssignment } from "@/lib/scheduling/validateAssignment";

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
  if (!row || row.kind !== CoverageKind.SWAP) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.status !== CoverageStatus.AWAITING_PEER) {
    return NextResponse.json({ error: "No longer awaiting acceptance" }, { status: 400 });
  }
  if (row.toUserId !== session.sub) {
    return NextResponse.json({ error: "Only the invited coworker can accept" }, { status: 403 });
  }

  const check = await validateAssignment(prisma, {
    shiftId: row.assignment.shiftId,
    userId: session.sub,
  });
  if (!check.ok) {
    return NextResponse.json({ error: "You no longer fit this shift.", violations: check.violations }, { status: 422 });
  }

  const updated = await prisma.coverageRequest.update({
    where: { id: requestId },
    data: {
      status: CoverageStatus.AWAITING_MANAGER,
      peerAcceptedAt: new Date(),
    },
  });

  const managers = await prisma.managerLocation.findMany({
    where: { locationId: row.assignment.shift.locationId },
    select: { userId: true },
  });
  for (const m of managers) {
    await notifyUser({
      userId: m.userId,
      type: "MANAGER_APPROVAL_NEEDED",
      title: "Swap ready for approval",
      body: `${session.name} accepted a swap. Please review.`,
      data: { coverageRequestId: requestId },
    });
  }

  return NextResponse.json({ request: updated });
}
