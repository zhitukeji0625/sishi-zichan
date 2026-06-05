import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { validateReservationRange, getCapacityForDay } from "@/lib/drying";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("drying reservation", () => {
  let orgId: string;
  let assetId: string;
  let listingId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "晾晒测试组织", code: `D${Date.now()}`, level: "COMPANY" },
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

  it("reports available capacity for a day", async () => {
    const cap = await getCapacityForDay(listingId, new Date("2026-06-15"));
    expect(cap.max).toBe(2);
    expect(cap.available).toBe(2);
  });

  it("accepts reservation when capacity available", async () => {
    const result = await validateReservationRange(
      listingId,
      new Date("2026-06-15"),
      new Date("2026-06-16"),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects when day is full", async () => {
    const user = await prisma.endUser.create({
      data: { phone: `198${Date.now().toString().slice(-8)}`, passwordHash: "x", name: "u1" },
    });
    const user2 = await prisma.endUser.create({
      data: { phone: `197${Date.now().toString().slice(-8)}`, passwordHash: "x", name: "u2" },
    });
    await prisma.dryingReservation.createMany({
      data: [
        {
          listingId,
          endUserId: user.id,
          startDate: new Date("2026-06-20"),
          endDate: new Date("2026-06-20"),
          status: "APPROVED",
        },
        {
          listingId,
          endUserId: user2.id,
          startDate: new Date("2026-06-20"),
          endDate: new Date("2026-06-20"),
          status: "PENDING_REVIEW",
        },
      ],
    });
    const result = await validateReservationRange(
      listingId,
      new Date("2026-06-20"),
      new Date("2026-06-20"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("已满");
    await prisma.dryingReservation.deleteMany({
      where: { endUserId: { in: [user.id, user2.id] } },
    });
    await prisma.endUser.deleteMany({ where: { id: { in: [user.id, user2.id] } } });
  });
});
