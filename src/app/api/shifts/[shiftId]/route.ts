import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getManagerLocationIds } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { cancelPendingCoverageForShift } from "@/lib/coverage";
import { getSession } from "@/lib/auth/session";
import { notifyUser } from "@/lib/notifications";
import { emitRealtime } from "@/lib/realtime/bus";
import { prisma } from "@/lib/prisma";
import { assertEditAllowed } from "@/lib/scheduling/publish";

const patchSchema = z.object({
  startUtc: z.string().datetime().optional(),
  endUtc: z.string().datetime().optional(),
  headcount: z.number().int().min(1).optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ shiftId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "STAFF") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { shiftId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (session.role === "MANAGER") {
    const ids = await getManagerLocationIds(session.sub);
    if (!ids.includes(shift.locationId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const edit = await assertEditAllowed(shiftId);
  if (!edit.ok) return NextResponse.json({ error: edit.message }, { status: 400 });

  const before = { ...shift };
  const data: Prisma.ShiftUpdateInput = {};
  if (parsed.data.startUtc) data.startUtc = new Date(parsed.data.startUtc);
  if (parsed.data.endUtc) data.endUtc = new Date(parsed.data.endUtc);
  if (parsed.data.headcount != null) data.headcount = parsed.data.headcount;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

  const timesChanged =
    !!parsed.data.startUtc || !!parsed.data.endUtc;

  let cancelledRows: { id: string; fromUserId: string; toUserId: string | null }[] = [];
  const updated = await prisma.$transaction(async (tx) => {
    if (timesChanged) {
      cancelledRows = await cancelPendingCoverageForShift(shiftId, tx);
    }
    return tx.shift.update({
      where: { id: shiftId },
      data,
    });
  });

  if (timesChanged && cancelledRows.length > 0) {
    for (const c of cancelledRows) {
      const targets = new Set([c.fromUserId, c.toUserId].filter(Boolean) as string[]);
      for (const uid of targets) {
        await notifyUser({
          userId: uid,
          type: "REQUEST_CANCELLED_SHIFT_EDITED",
          title: "Swap or drop request cancelled",
          body: "The shift changed and your pending request was cancelled.",
          data: { coverageRequestId: c.id, shiftId },
        });
      }
    }
  }

  await logAudit({
    actorId: session.sub,
    entityType: "Shift",
    entityId: shiftId,
    action: "UPDATE",
    before,
    after: updated,
  });

  emitRealtime({
    type: "schedule_updated",
    locationId: shift.locationId,
    payload: { shiftId },
  });

  return NextResponse.json({ shift: updated });
}
