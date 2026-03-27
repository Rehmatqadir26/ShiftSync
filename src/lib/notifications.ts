import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime/bus";

export async function notifyUser(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  simulateEmail?: boolean;
}) {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: input.userId },
  });
  const inApp = prefs?.inAppEnabled ?? true;
  const emailSim = input.simulateEmail ?? prefs?.emailSimEnabled ?? false;

  if (inApp) {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data ?? undefined,
      },
    });
    emitRealtime({ type: "notification", userId: input.userId, payload: input });
  }
  if (emailSim) {
    await prisma.simulatedEmail.create({
      data: {
        userId: input.userId,
        subject: input.title,
        body: `${input.body}\n\n${input.data ? JSON.stringify(input.data) : ""}`,
      },
    });
  }
}
