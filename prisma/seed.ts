import "dotenv/config";

import {
  CoverageKind,
  CoverageStatus,
  NotificationType,
  PrismaClient,
  Role,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";

const prisma = new PrismaClient();

const pass = bcrypt.hashSync("password", 10);

/** 0=Sun … 6=Sat */
function weeklyAvailability(
  startHour: number,
  endHour: number,
): { dayOfWeek: number; startMinute: number; endMinute: number }[] {
  const sm = startHour * 60;
  const em = endHour * 60;
  return [1, 2, 3, 4, 5, 6].map((d) => ({
    dayOfWeek: d,
    startMinute: sm,
    endMinute: em,
  }));
}

async function main() {
  await prisma.organizationSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", editCutoffHoursBefore: 48 },
    update: {},
  });

  const skillServer = await prisma.skill.upsert({
    where: { name: "Server" },
    create: { name: "Server" },
    update: {},
  });
  const skillBartender = await prisma.skill.upsert({
    where: { name: "Bartender" },
    create: { name: "Bartender" },
    update: {},
  });
  const skillCook = await prisma.skill.upsert({
    where: { name: "Line Cook" },
    create: { name: "Line Cook" },
    update: {},
  });
  const skillHost = await prisma.skill.upsert({
    where: { name: "Host" },
    create: { name: "Host" },
    update: {},
  });

  const locPier = await prisma.location.upsert({
    where: { code: "PIER" },
    create: {
      name: "Pier 39 Grill",
      code: "PIER",
      timezone: "America/Los_Angeles",
    },
    update: {},
  });
  const locMission = await prisma.location.upsert({
    where: { code: "MIST" },
    create: {
      name: "Mission Bistro",
      code: "MIST",
      timezone: "America/Los_Angeles",
    },
    update: {},
  });
  const locHarbor = await prisma.location.upsert({
    where: { code: "HEAST" },
    create: {
      name: "Harbor East",
      code: "HEAST",
      timezone: "America/New_York",
    },
    update: {},
  });
  const locBoard = await prisma.location.upsert({
    where: { code: "BOARD" },
    create: {
      name: "Boardwalk Tavern",
      code: "BOARD",
      timezone: "America/New_York",
    },
    update: {},
  });

  const admin =
    (await prisma.user.findUnique({ where: { email: "admin@coastaleats.demo" } })) ??
    (await prisma.user.create({
      data: {
        email: "admin@coastaleats.demo",
        name: "Quinn Admin",
        role: Role.ADMIN,
        passwordHash: pass,
      },
    }));

  const marina =
    (await prisma.user.findUnique({ where: { email: "marina@coastaleats.demo" } })) ??
    (await prisma.user.create({
      data: {
        email: "marina@coastaleats.demo",
        name: "Marina Lopez",
        role: Role.MANAGER,
        passwordHash: pass,
      },
    }));
  await prisma.managerLocation.upsert({
    where: { userId_locationId: { userId: marina.id, locationId: locPier.id } },
    create: { userId: marina.id, locationId: locPier.id },
    update: {},
  });
  await prisma.managerLocation.upsert({
    where: { userId_locationId: { userId: marina.id, locationId: locMission.id } },
    create: { userId: marina.id, locationId: locMission.id },
    update: {},
  });

  const dante =
    (await prisma.user.findUnique({ where: { email: "dante@coastaleats.demo" } })) ??
    (await prisma.user.create({
      data: {
        email: "dante@coastaleats.demo",
        name: "Dante Ruiz",
        role: Role.MANAGER,
        passwordHash: pass,
      },
    }));
  await prisma.managerLocation.upsert({
    where: { userId_locationId: { userId: dante.id, locationId: locHarbor.id } },
    create: { userId: dante.id, locationId: locHarbor.id },
    update: {},
  });
  await prisma.managerLocation.upsert({
    where: { userId_locationId: { userId: dante.id, locationId: locBoard.id } },
    create: { userId: dante.id, locationId: locBoard.id },
    update: {},
  });

  async function seedStaff(
    email: string,
    name: string,
    opts: {
      desiredHours: number;
      availabilityTz: string;
      skillIds: string[];
      certs: { locationId: string; active: boolean }[];
      recurring: { dayOfWeek: number; startMinute: number; endMinute: number }[];
    },
  ) {
    let u = await prisma.user.findUnique({ where: { email } });
    if (!u) {
      u = await prisma.user.create({
        data: { email, name, role: Role.STAFF, passwordHash: pass },
      });
    } else {
      u = await prisma.user.update({
        where: { id: u.id },
        data: { name, passwordHash: pass, role: Role.STAFF },
      });
    }
    await prisma.staffProfile.upsert({
      where: { userId: u.id },
      create: {
        userId: u.id,
        desiredHoursWeekly: opts.desiredHours,
        availabilityTimezone: opts.availabilityTz,
        hourlyRateCents: 2200,
      },
      update: {
        desiredHoursWeekly: opts.desiredHours,
        availabilityTimezone: opts.availabilityTz,
      },
    });
    await prisma.staffSkill.deleteMany({ where: { userId: u.id } });
    await prisma.availabilityRecurring.deleteMany({ where: { userId: u.id } });
    await prisma.staffLocationCert.deleteMany({ where: { userId: u.id } });
    for (const sid of opts.skillIds) {
      await prisma.staffSkill.create({ data: { userId: u.id, skillId: sid } });
    }
    for (const c of opts.certs) {
      await prisma.staffLocationCert.create({
        data: { userId: u.id, locationId: c.locationId, active: c.active },
      });
    }
    for (const r of opts.recurring) {
      await prisma.availabilityRecurring.create({
        data: {
          userId: u.id,
          dayOfWeek: r.dayOfWeek,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
        },
      });
    }
    return u;
  }

  // Sarah: bartender+server, certified west + east (timezone story), 9–5 in Los Angeles local
  await seedStaff("sarah@coastaleats.demo", "Sarah Kim", {
    desiredHours: 36,
    availabilityTz: "America/Los_Angeles",
    skillIds: [skillBartender.id, skillServer.id],
    certs: [
      { locationId: locPier.id, active: true },
      { locationId: locMission.id, active: true },
      { locationId: locHarbor.id, active: true },
      { locationId: locBoard.id, active: false },
    ],
    recurring: weeklyAvailability(9, 17),
  });

  await seedStaff("john@coastaleats.demo", "John Patel", {
    desiredHours: 38,
    availabilityTz: "America/Los_Angeles",
    skillIds: [skillCook.id],
    certs: [
      { locationId: locPier.id, active: true },
      { locationId: locMission.id, active: true },
    ],
    recurring: weeklyAvailability(10, 22),
  });

  await seedStaff("maria@coastaleats.demo", "Maria Santos", {
    desiredHours: 30,
    availabilityTz: "America/New_York",
    skillIds: [skillHost.id, skillServer.id],
    certs: [
      { locationId: locHarbor.id, active: true },
      { locationId: locBoard.id, active: true },
      { locationId: locPier.id, active: true },
    ],
    recurring: weeklyAvailability(8, 20),
  });

  await seedStaff("alex@coastaleats.demo", "Alex Rivera", {
    desiredHours: 25,
    availabilityTz: "America/New_York",
    skillIds: [skillServer.id],
    certs: [
      { locationId: locHarbor.id, active: true },
      { locationId: locBoard.id, active: true },
    ],
    recurring: weeklyAvailability(16, 23),
  });

  await seedStaff("jordan@coastaleats.demo", "Jordan Lee", {
    desiredHours: 28,
    availabilityTz: "America/Los_Angeles",
    skillIds: [skillBartender.id],
    certs: [
      { locationId: locPier.id, active: true },
      { locationId: locBoard.id, active: true },
    ],
    recurring: weeklyAvailability(12, 24),
  });

  await seedStaff("casey@coastaleats.demo", "Casey Nguyen", {
    desiredHours: 34,
    availabilityTz: "America/Chicago",
    skillIds: [skillCook.id],
    certs: [
      { locationId: locMission.id, active: true },
      { locationId: locHarbor.id, active: true },
    ],
    recurring: weeklyAvailability(11, 21),
  });

  // Shifts for "this" ISO week in Pier TZ (anchor for consistent demo week)
  const mondayPier = DateTime.now().setZone("America/Los_Angeles").set({ weekday: 1 }).startOf("day");

  await prisma.auditLog.deleteMany({});
  await prisma.coverageRequest.deleteMany({});
  await prisma.clockEvent.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.simulatedEmail.deleteMany({});
  await prisma.shiftAssignment.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.publishedWeek.deleteMany({});
  await prisma.availabilityException.deleteMany({});

  const mk = (
    locId: string,
    skillId: string,
    dayOffset: number,
    startH: number,
    startM: number,
    durH: number,
    headcount = 2,
  ) => {
    const startLocal = mondayPier.plus({ days: dayOffset }).set({
      hour: startH,
      minute: startM,
      second: 0,
      millisecond: 0,
    });
    const endLocal = startLocal.plus({ hours: durH });
    return prisma.shift.create({
      data: {
        locationId: locId,
        requiredSkillId: skillId,
        headcount,
        startUtc: startLocal.toUTC().toJSDate(),
        endUtc: endLocal.toUTC().toJSDate(),
        notes: durH >= 8 ? "Long coverage block" : null,
      },
    });
  };

  // West coast — busy week: lunch + dinner + bar
  await mk(locPier.id, skillServer.id, 0, 11, 30, 4, 3);
  await mk(locPier.id, skillServer.id, 0, 17, 0, 5, 3);
  await mk(locPier.id, skillBartender.id, 1, 16, 0, 6, 2);
  await mk(locPier.id, skillCook.id, 2, 10, 0, 7, 2);
  await mk(locPier.id, skillBartender.id, 2, 11, 0, 7, 2);
  await mk(locPier.id, skillServer.id, 4, 17, 0, 6, 3);
  await mk(locMission.id, skillCook.id, 0, 7, 0, 8, 2);
  await mk(locMission.id, skillServer.id, 1, 9, 0, 8, 2);
  await mk(locMission.id, skillHost.id, 3, 10, 0, 5, 2);
  await mk(locMission.id, skillCook.id, 5, 8, 0, 9, 2);
  await mk(locHarbor.id, skillServer.id, 2, 17, 0, 6, 2);
  await mk(locHarbor.id, skillBartender.id, 4, 18, 0, 5, 2);
  await mk(locHarbor.id, skillHost.id, 6, 11, 0, 6, 2);
  await mk(locBoard.id, skillBartender.id, 1, 17, 0, 6, 2);
  await mk(locBoard.id, skillServer.id, 3, 18, 0, 5, 2);
  await mk(locBoard.id, skillCook.id, 5, 12, 0, 8, 2);

  // Overnight: Saturday 23:00 – Sunday 03:00 local at Pier
  const satLate = mondayPier.plus({ days: 5 }).set({ hour: 23, minute: 0 });
  await prisma.shift.create({
    data: {
      locationId: locPier.id,
      requiredSkillId: skillCook.id,
      headcount: 1,
      startUtc: satLate.toUTC().toJSDate(),
      endUtc: satLate.plus({ hours: 4 }).toUTC().toJSDate(),
      notes: "Overnight close",
    },
  });

  /** Fill shifts without double-booking staff (same logic as product overlap checks). */
  function overlaps(a0: Date, a1: Date, b0: Date, b1: Date) {
    return a0.getTime() < b1.getTime() && b0.getTime() < a1.getTime();
  }

  const roster = await prisma.user.findMany({
    where: { role: Role.STAFF },
    include: {
      staffSkills: { select: { skillId: true } },
      staffLocationCerts: { where: { active: true }, select: { locationId: true } },
    },
    orderBy: { name: "asc" },
  });

  const allShifts = await prisma.shift.findMany({ orderBy: { startUtc: "asc" } });
  for (const sh of allShifts) {
    let count = await prisma.shiftAssignment.count({ where: { shiftId: sh.id } });
    for (const u of roster) {
      if (count >= sh.headcount) break;
      const hasSkill = u.staffSkills.some((x) => x.skillId === sh.requiredSkillId);
      const hasCert = u.staffLocationCerts.some((x) => x.locationId === sh.locationId);
      if (!hasSkill || !hasCert) continue;

      const existing = await prisma.shiftAssignment.findMany({
        where: { userId: u.id },
        include: { shift: true },
      });
      const clash = existing.some((as) =>
        overlaps(sh.startUtc, sh.endUtc, as.shift.startUtc, as.shift.endUtc),
      );
      if (clash) continue;

      try {
        await prisma.shiftAssignment.create({
          data: { shiftId: sh.id, userId: u.id },
        });
        count += 1;
      } catch {
        /* unique */
      }
    }
  }

  const sarah = await prisma.user.findUniqueOrThrow({ where: { email: "sarah@coastaleats.demo" } });
  const john = await prisma.user.findUniqueOrThrow({ where: { email: "john@coastaleats.demo" } });
  const maria = await prisma.user.findUniqueOrThrow({ where: { email: "maria@coastaleats.demo" } });
  const alex = await prisma.user.findUniqueOrThrow({ where: { email: "alex@coastaleats.demo" } });
  const jordan = await prisma.user.findUniqueOrThrow({ where: { email: "jordan@coastaleats.demo" } });

  // Live "on duty" row: shift window around now (Pier) + open clock event
  const laNow = DateTime.now().setZone("America/Los_Angeles");
  const liveStart = laNow.minus({ hours: 1 });
  const liveEnd = laNow.plus({ hours: 5 });
  const liveShift = await prisma.shift.create({
    data: {
      locationId: locPier.id,
      requiredSkillId: skillServer.id,
      headcount: 2,
      startUtc: liveStart.toUTC().toJSDate(),
      endUtc: liveEnd.toUTC().toJSDate(),
      notes: "Seed: active window for On duty demo",
    },
  });

  for (const candidate of [maria, sarah, alex]) {
    const hasSkill = await prisma.staffSkill.findFirst({
      where: { userId: candidate.id, skillId: skillServer.id },
    });
    const cert = await prisma.staffLocationCert.findFirst({
      where: { userId: candidate.id, locationId: locPier.id, active: true },
    });
    if (!hasSkill || !cert) continue;

    const busy = await prisma.shiftAssignment.findMany({
      where: { userId: candidate.id },
      include: { shift: true },
    });
    const ov = busy.some((a) =>
      overlaps(liveShift.startUtc, liveShift.endUtc, a.shift.startUtc, a.shift.endUtc),
    );
    if (ov) continue;

    const asn = await prisma.shiftAssignment.create({
      data: { shiftId: liveShift.id, userId: candidate.id },
    });
    await prisma.clockEvent.create({
      data: {
        userId: candidate.id,
        assignmentId: asn.id,
        clockInUtc: laNow.minus({ minutes: 42 }).toUTC().toJSDate(),
        clockOutUtc: null,
      },
    });
    break;
  }

  // Sample coverage requests (IDs from real assignments)
  const mariaAssign = await prisma.shiftAssignment.findFirst({
    where: { userId: maria.id },
    include: { shift: true },
    orderBy: { id: "asc" },
  });
  if (mariaAssign) {
    await prisma.coverageRequest.create({
      data: {
        kind: CoverageKind.DROP,
        status: CoverageStatus.AWAITING_PEER,
        assignmentId: mariaAssign.id,
        fromUserId: maria.id,
        toUserId: null,
        expiresAt: DateTime.fromJSDate(mariaAssign.shift.startUtc, { zone: "utc" })
          .minus({ hours: 24 })
          .toJSDate(),
      },
    });
  }

  const johnAssign = await prisma.shiftAssignment.findFirst({
    where: { userId: john.id },
    include: { shift: true },
  });
  if (johnAssign && johnAssign.shiftId) {
    await prisma.coverageRequest.create({
      data: {
        kind: CoverageKind.SWAP,
        status: CoverageStatus.AWAITING_PEER,
        assignmentId: johnAssign.id,
        fromUserId: john.id,
        toUserId: alex.id,
      },
    });
  }

  const sarahAssign = await prisma.shiftAssignment.findFirst({
    where: {
      userId: sarah.id,
      shiftId: { not: liveShift.id },
    },
    orderBy: { id: "asc" },
  });
  if (sarahAssign) {
    await prisma.coverageRequest.create({
      data: {
        kind: CoverageKind.SWAP,
        status: CoverageStatus.AWAITING_MANAGER,
        assignmentId: sarahAssign.id,
        fromUserId: sarah.id,
        toUserId: jordan.id,
        peerAcceptedAt: DateTime.now().minus({ hours: 2 }).toJSDate(),
      },
    });
  }

  // Published week for all four sites (managers can still unpublish in UI)
  const weekMondayUtc = mondayPier.toUTC().toJSDate();
  for (const loc of [locPier, locMission, locHarbor, locBoard]) {
    await prisma.publishedWeek.create({
      data: {
        locationId: loc.id,
        weekMonday: weekMondayUtc,
        publishedBy: loc.id === locHarbor.id || loc.id === locBoard.id ? dante.id : marina.id,
      },
    });
  }

  await prisma.notification.createMany({
    data: [
      {
        userId: sarah.id,
        type: NotificationType.SHIFT_ASSIGNED,
        title: "You're scheduled",
        body: "Coastal Eats: new assignment on your schedule.",
      },
      {
        userId: marina.id,
        type: NotificationType.MANAGER_APPROVAL_NEEDED,
        title: "Approval needed",
        body: "A coverage request is waiting for manager review.",
      },
      {
        userId: dante.id,
        type: NotificationType.SCHEDULE_PUBLISHED,
        title: "Week published",
        body: "Harbor East schedule is live for the team.",
      },
      {
        userId: john.id,
        type: NotificationType.SWAP_UPDATE,
        title: "Swap request",
        body: "A coworker invited you to cover a shift.",
      },
    ],
  });

  await prisma.notificationPreference.deleteMany({});
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  for (const u of allUsers) {
    await prisma.notificationPreference.create({
      data: {
        userId: u.id,
        inAppEnabled: true,
        emailSimEnabled: u.id === marina.id || u.id === dante.id,
      },
    });
  }

  /** Calendar day as UTC noon (matches app convention for availability exceptions). */
  const utcNoonDate = (isoDate: string) => new Date(`${isoDate}T12:00:00.000Z`);

  const casey = await prisma.user.findUniqueOrThrow({ where: { email: "casey@coastaleats.demo" } });

  await prisma.availabilityException.createMany({
    data: [
      {
        userId: sarah.id,
        date: utcNoonDate(mondayPier.plus({ days: 20 }).toISODate()!),
        available: false,
        startMinute: null,
        endMinute: null,
      },
      {
        userId: casey.id,
        date: utcNoonDate(mondayPier.plus({ days: 21 }).toISODate()!),
        available: true,
        startMinute: 11 * 60,
        endMinute: 15 * 60,
      },
      {
        userId: john.id,
        date: utcNoonDate(mondayPier.plus({ days: 22 }).toISODate()!),
        available: false,
        startMinute: null,
        endMinute: null,
      },
    ],
  });

  const pastAssignments = await prisma.shiftAssignment.findMany({
    where: { shift: { endUtc: { lt: new Date() } } },
    include: { shift: true },
    orderBy: { shift: { endUtc: "desc" } },
    take: 6,
  });
  for (const pa of pastAssignments) {
    const hasClock = await prisma.clockEvent.findFirst({ where: { assignmentId: pa.id } });
    if (hasClock) continue;
    await prisma.clockEvent.create({
      data: {
        userId: pa.userId,
        assignmentId: pa.id,
        clockInUtc: DateTime.fromJSDate(pa.shift.startUtc, { zone: "utc" })
          .minus({ minutes: 7 })
          .toJSDate(),
        clockOutUtc: DateTime.fromJSDate(pa.shift.endUtc, { zone: "utc" })
          .plus({ minutes: 14 })
          .toJSDate(),
      },
    });
  }

  const alexAssign = await prisma.shiftAssignment.findFirst({
    where: { userId: alex.id },
    orderBy: { id: "asc" },
  });
  const caseyAssign = await prisma.shiftAssignment.findFirst({
    where: { userId: casey.id },
    orderBy: { id: "asc" },
  });

  if (alexAssign) {
    await prisma.coverageRequest.create({
      data: {
        kind: CoverageKind.SWAP,
        status: CoverageStatus.APPROVED,
        assignmentId: alexAssign.id,
        fromUserId: alex.id,
        toUserId: maria.id,
        peerAcceptedAt: DateTime.now().minus({ days: 1 }).toJSDate(),
        decidedAt: DateTime.now().minus({ hours: 20 }).toJSDate(),
        decidedById: dante.id,
        managerNote: "Approved: certified at location.",
      },
    });
  }
  if (caseyAssign) {
    await prisma.coverageRequest.create({
      data: {
        kind: CoverageKind.DROP,
        status: CoverageStatus.REJECTED,
        assignmentId: caseyAssign.id,
        fromUserId: casey.id,
        toUserId: null,
        decidedAt: DateTime.now().minus({ hours: 6 }).toJSDate(),
        decidedById: marina.id,
        managerNote: "Short notice — need coverage from pool.",
      },
    });
  }

  const expiredAssign = await prisma.shiftAssignment.findFirst({
    where: {
      userId: jordan.id,
      shift: { startUtc: { gt: new Date() } },
    },
    include: { shift: true },
  });
  if (expiredAssign) {
    await prisma.coverageRequest.create({
      data: {
        kind: CoverageKind.SWAP,
        status: CoverageStatus.EXPIRED,
        assignmentId: expiredAssign.id,
        fromUserId: jordan.id,
        toUserId: sarah.id,
        expiresAt: DateTime.now().minus({ hours: 3 }).toJSDate(),
      },
    });
  }

  const jordanAltAssign = await prisma.shiftAssignment.findFirst({
    where: {
      userId: jordan.id,
      ...(expiredAssign ? { id: { not: expiredAssign.id } } : {}),
    },
  });
  const mariaAltAssign =
    mariaAssign ?
      await prisma.shiftAssignment.findFirst({
        where: { userId: maria.id, id: { not: mariaAssign.id } },
      })
    : null;
  const cancelAssign = jordanAltAssign ?? mariaAltAssign;
  if (cancelAssign) {
    await prisma.coverageRequest.create({
      data: {
        kind: CoverageKind.SWAP,
        status: CoverageStatus.CANCELLED,
        assignmentId: cancelAssign.id,
        fromUserId: cancelAssign.userId,
        toUserId: alex.id,
      },
    });
  }

  const sampleShift = await prisma.shift.findFirst({
    where: { locationId: locPier.id },
    orderBy: { startUtc: "asc" },
  });
  const sampleAssignment =
    sampleShift ?
      await prisma.shiftAssignment.findFirst({
        where: { shiftId: sampleShift.id },
      })
    : null;
  const approvedCov = await prisma.coverageRequest.findFirst({
    where: { status: CoverageStatus.APPROVED },
  });

  await prisma.auditLog.createMany({
    data: [
      ...(sampleShift
        ? [
            {
              actorId: marina.id,
              entityType: "Shift",
              entityId: sampleShift.id,
              action: "CREATE",
              after: {
                locationId: locPier.id,
                startUtc: sampleShift.startUtc.toISOString(),
                endUtc: sampleShift.endUtc.toISOString(),
              },
            },
          ]
        : []),
      ...(sampleAssignment
        ? [
            {
              actorId: marina.id,
              entityType: "ShiftAssignment",
              entityId: sampleAssignment.id,
              action: "CREATE",
              after: { shiftId: sampleAssignment.shiftId, userId: sampleAssignment.userId },
            },
          ]
        : []),
      ...(approvedCov
        ? [
            {
              actorId: dante.id,
              entityType: "CoverageRequest",
              entityId: approvedCov.id,
              action: "APPROVE",
              after: { coverageRequestId: approvedCov.id },
            },
          ]
        : []),
      {
        actorId: admin.id,
        entityType: "OrganizationSettings",
        entityId: "singleton",
        action: "UPDATE",
        before: { editCutoffHoursBefore: 72 },
        after: { editCutoffHoursBefore: 48 },
        reason: "Align with ops policy (seed).",
      },
    ],
  });

  await prisma.simulatedEmail.createMany({
    data: [
      {
        userId: marina.id,
        subject: "Schedule published — Pier 39",
        body: "The week of the attached roster is now live for Coastal Eats (Pier).\n\n— ShiftSync",
      },
      {
        userId: dante.id,
        subject: "Manager digest: pending swaps",
        body: "You have 1+ coverage requests awaiting decision in Harbor East / Boardwalk.",
      },
      {
        userId: sarah.id,
        subject: "New shift assignment",
        body: "You were assigned to a shift. Open ShiftSync to view details.",
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: casey.id,
        type: NotificationType.OT_WARNING,
        title: "Hours notice",
        body: "You're approaching weekly hours near your target — check the fairness view.",
        readAt: null,
      },
      {
        userId: alex.id,
        type: NotificationType.GENERIC,
        title: "Profile reminder",
        body: "Keep your certifications up to date for new locations.",
        readAt: new Date(),
      },
    ],
  });

  // eslint-disable-next-line no-console
  console.log("Seed OK. Demo password for everyone: password");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
