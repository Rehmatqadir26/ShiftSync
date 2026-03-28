import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function jsonCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  try {
    return csvEscape(JSON.stringify(v));
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
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

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50_000,
    include: {
      actor: { select: { email: true, name: true } },
    },
  });

  const header = [
    "id",
    "createdAt",
    "actorEmail",
    "actorName",
    "entityType",
    "entityId",
    "action",
    "reason",
    "beforeJson",
    "afterJson",
  ].join(",");

  const lines = rows.map((row) =>
    [
      csvEscape(row.id),
      csvEscape(row.createdAt.toISOString()),
      csvEscape(row.actor.email),
      csvEscape(row.actor.name),
      csvEscape(row.entityType),
      csvEscape(row.entityId),
      csvEscape(row.action),
      csvEscape(row.reason ?? ""),
      jsonCell(row.before),
      jsonCell(row.after),
    ].join(","),
  );

  const csv = [header, ...lines].join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `shiftsync-audit-${stamp}.csv`;

  return new NextResponse("\uFEFF" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
