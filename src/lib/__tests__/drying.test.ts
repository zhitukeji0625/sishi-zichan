import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { addDays, startOfDay } from "date-fns";
import { validateReservationRange } from "@/lib/drying";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("validateReservationRange", () => {
  let listingId: string;
  let orgId: string;
  let assetId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "晾晒测试组织", code: `DRY${Date.now()}`, level: "COMPANY" },
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
            startDate: startOfDay(new Date()),
            endDate: addDays(startOfDay(new Date()), 365),
            maxPeople: 2,
          },
        },
        bookingRules: { create: { maxAdvanceDays: 7 } },
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

  it("rejects past dates", async () => {
    const past = addDays(startOfDay(new Date()), -1);
    const result = await validateReservationRange(listingId, past, past);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("不能早于今天");
  });

  it("rejects dates beyond max advance days", async () => {
    const far = addDays(startOfDay(new Date()), 30);
    const result = await validateReservationRange(listingId, far, far);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("最多可提前");
  });

  it("accepts valid dates within range", async () => {
    const day = addDays(startOfDay(new Date()), 2);
    const result = await validateReservationRange(listingId, day, day);
    expect(result.ok).toBe(true);
  });
});
