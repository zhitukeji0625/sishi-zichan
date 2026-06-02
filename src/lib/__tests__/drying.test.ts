import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { validateReservationRange, getCapacityForDay } from "@/lib/drying";
import { addDays, startOfDay } from "date-fns";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("drying reservations", () => {
  let listingId: string;
  let orgId: string;
  let assetId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "晒场测试组织", code: `D${Date.now()}`, level: "COMPANY" },
    });
    orgId = org.id;
    const asset = await prisma.asset.create({
      data: {
        orgId,
        type: "DRYING_FIELD",
        name: "测试晒场",
        locationText: "测试",
        status: "IN_USE",
      },
    });
    assetId = asset.id;
    const listing = await prisma.dryingFieldListing.create({
      data: {
        assetId,
        status: "OPERATING",
        capacityRules: {
          create: {
            startDate: new Date("2020-01-01"),
            endDate: new Date("2030-12-31"),
            maxPeople: 2,
          },
        },
      },
    });
    listingId = listing.id;
  });

  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.dryingReservation.deleteMany({ where: { listingId } });
    await prisma.dryingCapacityRule.deleteMany({ where: { listingId } });
    await prisma.dryingFieldListing.delete({ where: { id: listingId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.organization.delete({ where: { id: orgId } });
    if (createdUserIds.length) {
      await prisma.endUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("reports available capacity for an empty day", async () => {
    const day = addDays(startOfDay(new Date()), 10);
    const cap = await getCapacityForDay(listingId, day);
    expect(cap.max).toBe(2);
    expect(cap.booked).toBe(0);
    expect(cap.available).toBe(2);
  });

  it("rejects reservation when capacity is full", async () => {
    const start = addDays(startOfDay(new Date()), 20);
    const end = start;
    for (let i = 0; i < 2; i++) {
      const user = await prisma.endUser.create({
        data: { phone: `198${String(Date.now() + i).slice(-8)}`, passwordHash: "x" },
      });
      createdUserIds.push(user.id);
      await prisma.dryingReservation.create({
        data: {
          listingId,
          endUserId: user.id,
          startDate: start,
          endDate: end,
          status: "APPROVED",
        },
      });
    }
    const check = await validateReservationRange(listingId, start, end);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain("已满");
  });
});
