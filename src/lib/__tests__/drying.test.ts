import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { addDays, format } from "date-fns";
import { getCapacityForDay, validateReservationRange } from "@/lib/drying";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("drying capacity", () => {
  let orgId: string;
  let assetId: string;
  let listingId: string;

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
            startDate: new Date("2026-01-01"),
            endDate: new Date("2027-12-31"),
            maxPeople: 2,
          },
        },
        bookingRules: { create: { maxAdvanceDays: 30 } },
      },
    });
    listingId = listing.id;
  });

  afterAll(async () => {
    await prisma.dryingReservation.deleteMany({ where: { listingId } });
    await prisma.dryingCapacityRule.deleteMany({ where: { listingId } });
    await prisma.dryingBookingRule.deleteMany({ where: { listingId } });
    await prisma.dryingFieldListing.delete({ where: { id: listingId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("reports full capacity when maxPeople reached", async () => {
    const day = new Date("2026-06-15");
    const userA = await prisma.endUser.create({
      data: {
        phone: `198${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "用户A",
      },
    });
    const userB = await prisma.endUser.create({
      data: {
        phone: `197${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "用户B",
      },
    });
    await prisma.dryingReservation.createMany({
      data: [
        {
          listingId,
          endUserId: userA.id,
          startDate: day,
          endDate: day,
          status: "APPROVED",
        },
        {
          listingId,
          endUserId: userB.id,
          startDate: day,
          endDate: day,
          status: "PENDING_REVIEW",
        },
      ],
    });
    const cap = await getCapacityForDay(listingId, day);
    expect(cap.max).toBe(2);
    expect(cap.booked).toBe(2);
    expect(cap.available).toBe(0);

    const check = await validateReservationRange(listingId, day, day);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.message).toContain(format(day, "yyyy-MM-dd"));
    }

    await prisma.dryingReservation.deleteMany({
      where: { endUserId: { in: [userA.id, userB.id] } },
    });
    await prisma.endUser.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });

  it("accepts reservation when capacity remains", async () => {
    const start = addDays(new Date(), 14);
    const end = addDays(start, 1);
    const check = await validateReservationRange(listingId, start, end);
    expect(check.ok).toBe(true);
  });
});
