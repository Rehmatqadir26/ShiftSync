import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  emailSimEnabled: z.boolean().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: session.sub },
    create: { userId: session.sub, inAppEnabled: true, emailSimEnabled: false },
    update: {},
  });

  return NextResponse.json({ preferences: prefs });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: session.sub },
    create: {
      userId: session.sub,
      inAppEnabled: parsed.data.inAppEnabled ?? true,
      emailSimEnabled: parsed.data.emailSimEnabled ?? false,
    },
    update: {
      ...(parsed.data.inAppEnabled !== undefined ? { inAppEnabled: parsed.data.inAppEnabled } : {}),
      ...(parsed.data.emailSimEnabled !== undefined ? { emailSimEnabled: parsed.data.emailSimEnabled } : {}),
    },
  });

  return NextResponse.json({ preferences: prefs });
}
