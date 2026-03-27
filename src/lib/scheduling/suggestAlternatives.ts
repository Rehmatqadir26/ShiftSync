import type { DbClient } from "@/lib/db-types";
import { validateAssignment } from "./validateAssignment";

export async function suggestAlternatives(
  prisma: DbClient,
  shiftId: string,
  excludeUserIds: string[] = [],
  limit = 8,
) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { location: true, requiredSkill: true },
  });
  if (!shift) return [];

  const candidates = await prisma.user.findMany({
    where: {
      role: "STAFF",
      id: { notIn: excludeUserIds },
      staffSkills: { some: { skillId: shift.requiredSkillId } },
      staffLocationCerts: {
        some: { locationId: shift.locationId, active: true },
      },
    },
    select: { id: true, name: true },
    take: 80,
  });

  const scored: { id: string; name: string; ok: boolean; warnings: number }[] = [];
  for (const c of candidates) {
    const result = await validateAssignment(prisma, { shiftId, userId: c.id });
    const ok = result.ok;
    const warnings = result.warnings?.length ?? 0;
    scored.push({ ...c, ok, warnings });
    if (scored.filter((x) => x.ok).length >= limit) break;
  }

  return scored
    .filter((s) => s.ok)
    .sort((a, b) => a.warnings - b.warnings)
    .slice(0, limit);
}
