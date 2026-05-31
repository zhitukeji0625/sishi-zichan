import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { validateReservationRange, getCapacityForDay } from "@/lib/drying";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("drying reservation", () => {
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
    await prisma.dryingFieldListing.delete({ where: { id: listingId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("reports full capacity when max reached", async () => {
    const day = new Date("2026-07-01");
    const user1 = await prisma.endUser.create({
      data: { phone: `198${Date.now().toString().slice(-8)}1`, passwordHash: "x", name: "u1" },
    });
    const user2 = await prisma.endUser.create({
      data: { phone: `198${Date.now().toString().slice(-8)}2`, passwordHash: "x", name: "u2" },
    });
    await prisma.dryingReservation.createMany({
      data: [
        {
          listingId,
          endUserId: user1.id,
          startDate: day,
          endDate: day,
          status: "APPROVED",
        },
        {
          listingId,
          endUserId: user2.id,
          startDate: day,
          endDate: day,
          status: "PENDING_REVIEW",
        },
      ],
    });
    const cap = await getCapacityForDay(listingId, day);
    expect(cap.available).toBe(0);
    const check = await validateReservationRange(listingId, day, day);
    expect(check.ok).toBe(false);
    await prisma.dryingReservation.deleteMany({
      where: { endUserId: { in: [user1.id, user2.id] } },
    });
    await prisma.endUser.deleteMany({ where: { id: { in: [user1.id, user2.id] } } });
  });

  it("allows reservation when capacity available", async () => {
    const start = new Date("2026-08-01");
    const end = new Date("2026-08-02");
    const check = await validateReservationRange(listingId, start, end);
    expect(check.ok).toBe(true);
  });
});
