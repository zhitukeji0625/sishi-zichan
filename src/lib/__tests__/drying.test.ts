import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { startOfDay, addDays, format } from "date-fns";
import { validateReservationRange, getCapacityForDay } from "@/lib/drying";

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
        type: "LAND",
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
            startDate: startOfDay(new Date()),
            endDate: addDays(startOfDay(new Date()), 365),
            maxPeople: 1,
          },
        },
        bookingRules: {
          create: { maxAdvanceDays: 7 },
        },
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

  it("rejects inverted date range in validation", async () => {
    const start = addDays(startOfDay(new Date()), 2);
    const end = addDays(startOfDay(new Date()), 1);
    const result = await validateReservationRange(listingId, start, end);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("结束日期");
  });

  it("marks day full when capacity is 1", async () => {
    const day = addDays(startOfDay(new Date()), 1);
    const user = await prisma.endUser.create({
      data: {
        phone: `198${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "容量测试",
      },
    });
    await prisma.dryingReservation.create({
      data: {
        listingId,
        endUserId: user.id,
        startDate: day,
        endDate: day,
        status: "APPROVED",
      },
    });
    const cap = await getCapacityForDay(listingId, day);
    expect(cap.available).toBe(0);
    const check = await validateReservationRange(listingId, day, day);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain(format(day, "yyyy-MM-dd"));
    await prisma.dryingReservation.deleteMany({ where: { endUserId: user.id } });
    await prisma.endUser.delete({ where: { id: user.id } });
  });
});
