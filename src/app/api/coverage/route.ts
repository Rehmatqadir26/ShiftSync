import { CoverageKind, CoverageStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime/bus";
import { validateAssignment } from "@/lib/scheduling/validateAssignment";
import { DateTime } from "luxon";

const createSchema = z.object({
  kind: z.enum(["SWAP", "DROP"]),
  assignmentId: z.string(),
  toUserId: z.string().optional(),
});

async function countPendingForUser(userId: string) {
  return prisma.coverageRequest.count({
    where: {
      fromUserId: userId,
      status: { in: [CoverageStatus.AWAITING_PEER, CoverageStatus.AWAITING_MANAGER] },
    },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "STAFF") {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { kind, assignmentId, toUserId } = parsed.data;
  if (kind === "SWAP" && !toUserId) {
    return NextResponse.json({ error: "Swap needs toUserId" }, { status: 400 });
  }
  if (kind === "DROP" && toUserId) {
    return NextResponse.json({ error: "Drop starts without a taker" }, { status: 400 });
  }

  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: { shift: { include: { location: true } }, user: true },
  });
  if (!assignment || assignment.userId !== session.sub) {
    return NextResponse.json({ error: "Not your assignment" }, { status: 403 });
  }

  const pending = await countPendingForUser(session.sub);
  if (pending >= 3) {
    return NextResponse.json(
      { error: "You already have three open swap or drop requests. Resolve one first." },
      { status: 400 },
    );
  }

  const expireAt = DateTime.fromJSDate(assignment.shift.startUtc, { zone: "utc" }).minus({
    hours: 24,
  });

  if (kind === "SWAP" && toUserId) {
    const check = await validateAssignment(prisma, { shiftId: assignment.shiftId, userId: toUserId });
    if (!check.ok) {
      return NextResponse.json(
        { error: "Counterparty cannot work this shift as-is.", violations: check.violations },
        { status: 422 },
      );
    }
  }

  const row = await prisma.coverageRequest.create({
    data: {
      kind: kind as CoverageKind,
      assignmentId,
      fromUserId: session.sub,
      toUserId: toUserId ?? null,
      status:
        kind === "DROP" ? CoverageStatus.AWAITING_PEER : CoverageStatus.AWAITING_PEER,
      expiresAt: kind === "DROP" ? expireAt.toJSDate() : null,
    },
  });

  if (kind === "SWAP" && toUserId) {
    await notifyUser({
      userId: toUserId,
      type: "SWAP_UPDATE",
      title: "Swap request",
      body: `${session.name} asked to swap a shift with you.`,
      data: { coverageRequestId: row.id },
    });
  }

  const managers = await prisma.managerLocation.findMany({
    where: { locationId: assignment.shift.locationId },
    select: { userId: true },
  });
  for (const m of managers) {
    await notifyUser({
      userId: m.userId,
      type: "MANAGER_APPROVAL_NEEDED",
      title: "Coverage request",
      body: `${session.name} submitted a ${kind.toLowerCase()} request.`,
      data: { coverageRequestId: row.id },
    });
  }

  emitRealtime({ type: "coverage_update", locationId: assignment.shift.locationId, payload: row });

  return NextResponse.json({ request: row });
}
