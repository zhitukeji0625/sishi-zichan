import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { addDays, startOfDay } from "date-fns";
import { validateBookingRules } from "@/lib/drying";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("validateBookingRules", () => {
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
        bookingRules: { create: { maxAdvanceDays: 7 } },
      },
    });
    listingId = listing.id;
  });

  afterAll(async () => {
    await prisma.dryingBookingRule.deleteMany({ where: { listingId } });
    await prisma.dryingFieldListing.delete({ where: { id: listingId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("rejects start date in the past", async () => {
    const yesterday = addDays(startOfDay(new Date()), -1);
    const result = await validateBookingRules(listingId, yesterday, yesterday);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("不能早于今天");
  });

  it("rejects dates beyond max advance days", async () => {
    const tooFar = addDays(startOfDay(new Date()), 10);
    const result = await validateBookingRules(listingId, tooFar, tooFar);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("不能超过");
  });

  it("accepts valid date range", async () => {
    const tomorrow = addDays(startOfDay(new Date()), 1);
    const result = await validateBookingRules(listingId, tomorrow, tomorrow);
    expect(result.ok).toBe(true);
  });
});
