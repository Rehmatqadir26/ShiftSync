import { NextResponse } from "next/server";
import { z } from "zod";
import { getManagerLocationIds } from "@/lib/access";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { assertEditAllowed } from "@/lib/scheduling/publish";
import { suggestAlternatives } from "@/lib/scheduling/suggestAlternatives";
import { validateAssignment } from "@/lib/scheduling/validateAssignment";

const bodySchema = z.object({
  userId: z.string(),
  seventhDayReason: z.string().optional(),
});

/** Dry-run: same rules as assign, no database write. */
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
    return NextResponse.json({ ok: false, error: "Staff not certified for this location" });
  }

  const count = await prisma.shiftAssignment.count({ where: { shiftId } });
  if (count >= shift.headcount) {
    return NextResponse.json({
      ok: false,
      full: true,
      error: "Shift is already fully staffed",
    });
  }

  const existing = await prisma.shiftAssignment.findUnique({
    where: { shiftId_userId: { shiftId, userId } },
  });
  if (existing) {
    return NextResponse.json({
      ok: false,
      error: "That person is already on this shift",
      code: "ALREADY_ASSIGNED" as const,
    });
  }

  const check = await validateAssignment(prisma, {
    shiftId,
    userId,
    managerOverrideSeventhDay: !!seventhDayReason?.trim(),
    seventhDayReason,
  });

  if (!check.ok) {
    const suggestions = await suggestAlternatives(prisma, shiftId, [userId], 6);
    return NextResponse.json({
      ok: false,
      violations: check.violations,
      warnings: check.warnings,
      suggestions,
    });
  }

  return NextResponse.json({
    ok: true,
    warnings: check.warnings,
  });
}
