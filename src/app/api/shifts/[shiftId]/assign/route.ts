import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getManagerLocationIds } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { getSession } from "@/lib/auth/session";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime/bus";
import { assertEditAllowed } from "@/lib/scheduling/publish";
import { suggestAlternatives } from "@/lib/scheduling/suggestAlternatives";
import { validateAssignment } from "@/lib/scheduling/validateAssignment";

const bodySchema = z.object({
  userId: z.string(),
  seventhDayReason: z.string().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shiftId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "STAFF") {
    return NextResponse.json({ error: "Managers and admins only" }, { status: 403 });
  }

  const { shiftId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { userId, seventhDayReason } = parsed.data;

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { location: true },
  });
  if (!shift) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (session.role === "MANAGER") {
    const ids = await getManagerLocationIds(session.sub);
    if (!ids.includes(shift.locationId)) {
      return NextResponse.json({ error: "Not your location" }, { status: 403 });
    }
  }

  const edit = await assertEditAllowed(shiftId);
  if (!edit.ok) {
    return NextResponse.json({ error: edit.message }, { status: 400 });
  }

  const cert = await prisma.staffLocationCert.findUnique({
    where: { userId_locationId: { userId, locationId: shift.locationId } },
  });
  if (!cert?.active) {
    return NextResponse.json({ error: "Staff not certified for this location" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Shift" WHERE id = ${shiftId} FOR UPDATE`);

      const row = await tx.shift.findUnique({ where: { id: shiftId } });
      if (!row) throw new Error("missing");
      const count = await tx.shiftAssignment.count({ where: { shiftId } });
      if (count >= row.headcount) {
        return { type: "FULL" as const };
      }

      const check = await validateAssignment(tx, {
        shiftId,
        userId,
        managerOverrideSeventhDay: !!seventhDayReason?.trim(),
        seventhDayReason,
      });

      if (!check.ok) {
        const suggestions = await suggestAlternatives(tx, shiftId, [userId], 6);
        return { type: "RULES" as const, check, suggestions };
      }

      const created = await tx.shiftAssignment.create({
        data: { shiftId, userId },
      });

      return { type: "OK" as const, assignment: created, warnings: check.warnings };
    });

    if (result.type === "FULL") {
      return NextResponse.json({ error: "Shift is already fully staffed" }, { status: 409 });
    }
    if (result.type === "RULES") {
      return NextResponse.json(
        {
          error: "Scheduling rules blocked this assignment",
          violations: result.check.violations,
          warnings: result.check.warnings,
          suggestions: result.suggestions,
        },
        { status: 422 },
      );
    }

    await logAudit({
      actorId: session.sub,
      entityType: "ShiftAssignment",
      entityId: result.assignment.id,
      action: "CREATE",
      after: { shiftId, userId },
    });

    await notifyUser({
      userId,
      type: "SHIFT_ASSIGNED",
      title: "New shift assignment",
      body: `You were assigned to ${shift.location.name}.`,
      data: { shiftId },
    });

    emitRealtime({
      type: "schedule_updated",
      locationId: shift.locationId,
      payload: { shiftId },
    });

    return NextResponse.json({
      assignment: result.assignment,
      warnings: result.warnings,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        {
          error: "That person is already on this shift",
          code: "ASSIGNMENT_CONFLICT",
        },
        { status: 409 },
      );
    }
    throw e;
  }
}
