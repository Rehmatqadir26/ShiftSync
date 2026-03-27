import { CoverageKind, CoverageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { validateAssignment } from "@/lib/scheduling/validateAssignment";
import { DateTime } from "luxon";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ requestId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "STAFF") return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const { requestId } = await ctx.params;
  const row = await prisma.coverageRequest.findUnique({
    where: { id: requestId },
    include: { assignment: { include: { shift: true } } },
  });

  if (!row || row.kind !== CoverageKind.DROP) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.status !== CoverageStatus.AWAITING_PEER || row.toUserId) {
    return NextResponse.json({ error: "Drop is not available" }, { status: 400 });
  }
  if (row.expiresAt && DateTime.now() > DateTime.fromJSDate(row.expiresAt)) {
    await prisma.coverageRequest.update({
      where: { id: requestId },
      data: { status: CoverageStatus.EXPIRED },
    });
    return NextResponse.json({ error: "Drop offer expired" }, { status: 400 });
  }

  const check = await validateAssignment(prisma, {
    shiftId: row.assignment.shiftId,
    userId: session.sub,
  });
  if (!check.ok) {
    return NextResponse.json({ error: "You cannot pick up this shift.", violations: check.violations }, { status: 422 });
  }

  const updated = await prisma.coverageRequest.update({
    where: { id: requestId },
    data: {
      toUserId: session.sub,
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
      title: "Shift pickup",
      body: `${session.name} volunteered for a dropped shift.`,
      data: { coverageRequestId: requestId },
    });
  }

  return NextResponse.json({ request: updated });
}
