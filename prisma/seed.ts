import { PrismaClient, Role } from "@prisma/client";
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

  // Shifts for "this" ISO week in Pier TZ
  const mondayPier = DateTime.now().setZone("America/Los_Angeles").set({ weekday: 1 }).startOf("day");

  await prisma.shiftAssignment.deleteMany({});
  await prisma.shift.deleteMany({});

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

  await mk(locPier.id, skillServer.id, 0, 17, 0, 5, 3);
  await mk(locPier.id, skillBartender.id, 2, 11, 0, 7, 2);
  await mk(locMission.id, skillCook.id, 1, 9, 0, 8, 2);
  await mk(locHarbor.id, skillServer.id, 3, 18, 0, 6, 2);
  await mk(locBoard.id, skillBartender.id, 5, 18, 0, 5, 2);
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

  const sarah = await prisma.user.findUniqueOrThrow({ where: { email: "sarah@coastaleats.demo" } });
  const john = await prisma.user.findUniqueOrThrow({ where: { email: "john@coastaleats.demo" } });

  const shifts = await prisma.shift.findMany({ orderBy: { startUtc: "asc" } });
  if (shifts[0]) {
    await prisma.shiftAssignment.create({
      data: { shiftId: shifts[0]!.id, userId: sarah.id },
    });
  }
  if (shifts[1]) {
    await prisma.shiftAssignment.create({
      data: { shiftId: shifts[1]!.id, userId: john.id },
    });
  }

  await prisma.publishedWeek.deleteMany({});
  await prisma.publishedWeek.create({
    data: {
      locationId: locPier.id,
      weekMonday: mondayPier.toUTC().toJSDate(),
      publishedBy: marina.id,
    },
  });
  await prisma.publishedWeek.create({
    data: {
      locationId: locMission.id,
      weekMonday: mondayPier.toUTC().toJSDate(),
      publishedBy: marina.id,
    },
  });

  await prisma.notificationPreference.deleteMany({});
  for (const uid of [admin.id, marina.id, dante.id, sarah.id]) {
    await prisma.notificationPreference.create({
      data: { userId: uid, inAppEnabled: true, emailSimEnabled: false },
    });
  }

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
