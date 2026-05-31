import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { validateReservationRange, getCapacityForDay } from "@/lib/drying";
import { startOfDay, addDays } from "date-fns";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("drying capacity", () => {
  let listingId: string;
  let orgId: string;
  let assetId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "烘干测试组织", code: `D${Date.now()}`, level: "COMPANY" },
    });
    orgId = org.id;
    const asset = await prisma.asset.create({
      data: {
        orgId,
        type: "DRYING_FIELD",
        name: "测试晒场",
        locationText: "测试",
        status: "IDLE",
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
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("reports available capacity for empty day", async () => {
    const day = startOfDay(new Date("2026-07-01"));
    const cap = await getCapacityForDay(listingId, day);
    expect(cap.max).toBe(1);
    expect(cap.booked).toBe(0);
    expect(cap.available).toBe(1);
  });

  it("rejects reservation when day is full", async () => {
    const start = startOfDay(new Date("2026-08-01"));
    const end = start;
    const user = await prisma.endUser.create({
      data: {
        phone: `198${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "占满用户",
      },
    });
    await prisma.dryingReservation.create({
      data: {
        listingId,
        endUserId: user.id,
        startDate: start,
        endDate: end,
        status: "APPROVED",
      },
    });
    const check = await validateReservationRange(listingId, start, end);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain("已满");
    await prisma.dryingReservation.deleteMany({ where: { endUserId: user.id } });
    await prisma.endUser.delete({ where: { id: user.id } });
  });

  it("accepts reservation when capacity remains", async () => {
    const start = startOfDay(addDays(new Date("2026-09-01"), 0));
    const end = start;
    const check = await validateReservationRange(listingId, start, end);
    expect(check.ok).toBe(true);
  });
});
