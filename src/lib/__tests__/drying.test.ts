import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { addDays, format, startOfDay } from "date-fns";
import { validateReservationRange } from "@/lib/drying";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("validateReservationRange", () => {
  let orgId: string;
  let assetId: string;
  let listingId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "晒场测试组织", code: `DRY${Date.now()}`, level: "COMPANY" },
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
        bookingRules: { create: { maxAdvanceDays: 3 } },
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

  it("accepts reservation within maxAdvanceDays", async () => {
    const today = startOfDay(new Date());
    const start = addDays(today, 1);
    const end = addDays(today, 2);
    const result = await validateReservationRange(listingId, start, end);
    expect(result.ok).toBe(true);
  });

  it("rejects reservation beyond maxAdvanceDays", async () => {
    const today = startOfDay(new Date());
    const start = addDays(today, 4);
    const end = addDays(today, 4);
    const result = await validateReservationRange(listingId, start, end);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("最多可提前 3 天预约");
    }
  });

  it("rejects start date before today", async () => {
    const yesterday = addDays(startOfDay(new Date()), -1);
    const result = await validateReservationRange(listingId, yesterday, yesterday);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("开始日期不能早于今天");
    }
  });
});
