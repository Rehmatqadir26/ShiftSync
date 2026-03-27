import { CoverageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getManagerLocationIds } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { getSession } from "@/lib/auth/session";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime/bus";
import { validateAssignment } from "@/lib/scheduling/validateAssignment";

const bodySchema = z.object({
  approve: z.boolean(),
  reason: z.string().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ requestId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "STAFF") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { requestId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const row = await prisma.coverageRequest.findUnique({
    where: { id: requestId },
    include: {
      assignment: { include: { shift: { include: { location: true } } } },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (session.role === "MANAGER") {
    const ids = await getManagerLocationIds(session.sub);
    if (!ids.includes(row.assignment.shift.locationId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (row.status !== CoverageStatus.AWAITING_MANAGER) {
    return NextResponse.json({ error: "Nothing waiting on a manager decision" }, { status: 400 });
  }

  if (!parsed.data.approve) {
    const updated = await prisma.coverageRequest.update({
      where: { id: requestId },
      data: {
        status: CoverageStatus.REJECTED,
        decidedAt: new Date(),
        decidedById: session.sub,
        managerNote: parsed.data.reason ?? "Rejected",
      },
    });
    for (const uid of [row.fromUserId, row.toUserId].filter(Boolean) as string[]) {
      await notifyUser({
        userId: uid,
        type: "SWAP_UPDATE",
        title: "Coverage request closed",
        body: "A manager rejected the request.",
        data: { coverageRequestId: requestId },
      });
    }
    return NextResponse.json({ request: updated });
  }

  const toUserId = row.toUserId;
  if (!toUserId) {
    return NextResponse.json({ error: "Missing taker" }, { status: 400 });
  }

  const check = await validateAssignment(prisma, {
    shiftId: row.assignment.shiftId,
    userId: toUserId,
  });
  if (!check.ok) {
    return NextResponse.json(
      { error: "Approval is blocked by scheduling rules now.", violations: check.violations },
      { status: 422 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.shiftAssignment.update({
      where: { id: row.assignment.id },
      data: { userId: toUserId, version: { increment: 1 } },
    });
    await tx.coverageRequest.update({
      where: { id: requestId },
      data: {
        status: CoverageStatus.APPROVED,
        decidedAt: new Date(),
        decidedById: session.sub,
        managerNote: parsed.data.reason ?? null,
      },
    });
  });

  await logAudit({
    actorId: session.sub,
    entityType: "CoverageRequest",
    entityId: requestId,
    action: "APPROVE",
    after: { assignmentId: row.assignment.id, newUserId: toUserId },
  });

  for (const uid of [row.fromUserId, toUserId]) {
    await notifyUser({
      userId: uid,
      type: "SWAP_UPDATE",
      title: "Coverage approved",
      body: `${row.assignment.shift.location.name} shift assignment was updated.`,
      data: { coverageRequestId: requestId },
    });
  }

  emitRealtime({
    type: "schedule_updated",
    locationId: row.assignment.shift.locationId,
    payload: { coverageRequestId: requestId },
  });

  return NextResponse.json({ ok: true });
}
