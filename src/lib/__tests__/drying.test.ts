import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getCapacityForDay, validateReservationRange } from "@/lib/drying";
import { addDays, startOfDay } from "date-fns";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("drying capacity", () => {
  let orgId: string;
  let assetId: string;
  let listingId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "晒场测试组织", code: `D${Date.now()}`, level: "COMPANY" },
    });
    orgId = org.id;
    const user = await prisma.endUser.create({
      data: {
        phone: `198${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "晒场测试用户",
      },
    });
    userId = user.id;
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
            maxPeople: 1,
          },
        },
      },
    });
    listingId = listing.id;
  });

  afterAll(async () => {
    await prisma.dryingReservation.deleteMany({ where: { listingId } });
    await prisma.dryingCapacityRule.deleteMany({ where: { listingId } });
    await prisma.dryingFieldListing.delete({ where: { id: listingId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.endUser.delete({ where: { id: userId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("reports available capacity for an empty day", async () => {
    const day = startOfDay(addDays(new Date(), 30));
    const cap = await getCapacityForDay(listingId, day);
    expect(cap.max).toBe(1);
    expect(cap.booked).toBe(0);
    expect(cap.available).toBe(1);
  });

  it("rejects reservation when day is full", async () => {
    const day = startOfDay(addDays(new Date(), 31));
    await prisma.dryingReservation.create({
      data: {
        listingId,
        endUserId: userId,
        startDate: day,
        endDate: day,
        status: "APPROVED",
      },
    });
    const check = await validateReservationRange(listingId, day, day);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toMatch(/已满/);
  });
});
