import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

function parseLimit(raw: string | null, fallback: number, cap: number) {
  const n = parseInt(raw ?? "", 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(cap, Math.max(1, n));
}

function parseOffset(raw: string | null) {
  const n = parseInt(raw ?? "0", 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"), 50, 200);
  const offset = parseOffset(searchParams.get("offset"));
  const entityType = searchParams.get("entityType")?.trim() || undefined;
  const action = searchParams.get("action")?.trim() || undefined;
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  const where: Prisma.AuditLogWhereInput = {};
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;
  if (start || end) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (start) {
      const d = new Date(start);
      if (!Number.isNaN(d.getTime())) createdAt.gte = d;
    }
    if (end) {
      const d = new Date(end);
      if (!Number.isNaN(d.getTime())) createdAt.lte = d;
    }
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: offset,
      include: {
        actor: { select: { email: true, name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      actorId: row.actorId,
      actorEmail: row.actor.email,
      actorName: row.actor.name,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      reason: row.reason,
      before: row.before,
      after: row.after,
    })),
    total,
    limit,
    offset,
  });
}
