import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function cancelPendingCoverageForShift(
  shiftId: string,
  tx?: Prisma.TransactionClient,
): Promise<{ id: string; fromUserId: string; toUserId: string | null }[]> {
  const db = tx ?? prisma;
  const pending = await db.coverageRequest.findMany({
    where: {
      status: { in: ["AWAITING_PEER", "AWAITING_MANAGER"] },
      assignment: { shiftId },
    },
    select: { id: true, fromUserId: true, toUserId: true },
  });

  for (const c of pending) {
    await db.coverageRequest.update({
      where: { id: c.id },
      data: {
        status: "CANCELLED",
        managerNote: "Automatically cancelled because the shift was edited.",
      },
    });
  }

  return pending;
}
