import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { addDays, startOfDay } from "date-fns";
import {
  validateReservationRange,
  validateUserReservationOverlap,
  getCapacityForDay,
} from "@/lib/drying";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("drying reservations", () => {
  let orgId: string;
  let assetId: string;
  let listingId: string;
  let userId: string;
  let reservationId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "晒场测试组织", code: `D${Date.now()}`, level: "COMPANY" },
    });
    orgId = org.id;
    const asset = await prisma.asset.create({
      data: {
        orgId,
        type: "LAND",
        name: "测试晒场资产",
        locationText: "测试",
        status: "IDLE",
      },
    });
    assetId = asset.id;
    const listing = await prisma.dryingFieldListing.create({
      data: {
        assetId,
        status: "OPERATING",
        maxAdvanceDays: 30,
      },
    });
    listingId = listing.id;
    await prisma.dryingCapacityRule.create({
      data: {
        listingId,
        startDate: startOfDay(new Date()),
        endDate: startOfDay(addDays(new Date(), 365)),
        maxPeople: 2,
      },
    });
    const user = await prisma.endUser.create({
      data: {
        phone: `198${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "晒场测试用户",
      },
    });
    userId = user.id;
    const start = startOfDay(addDays(new Date(), 10));
    const end = startOfDay(addDays(new Date(), 12));
    const reservation = await prisma.dryingReservation.create({
      data: {
        listingId,
        endUserId: userId,
        startDate: start,
        endDate: end,
        status: "PENDING_REVIEW",
      },
    });
    reservationId = reservation.id;
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

  it("detects overlapping reservation for same user", async () => {
    const start = startOfDay(addDays(new Date(), 11));
    const end = startOfDay(addDays(new Date(), 13));
    const result = await validateUserReservationOverlap(userId, start, end);
    expect(result.ok).toBe(false);
  });

  it("allows non-overlapping reservation for same user", async () => {
    const start = startOfDay(addDays(new Date(), 20));
    const end = startOfDay(addDays(new Date(), 22));
    const result = await validateUserReservationOverlap(userId, start, end);
    expect(result.ok).toBe(true);
  });

  it("reports capacity when listing is full", async () => {
    const day = startOfDay(addDays(new Date(), 11));
    const otherUser = await prisma.endUser.create({
      data: {
        phone: `197${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "其他用户",
      },
    });
    await prisma.dryingReservation.create({
      data: {
        listingId,
        endUserId: otherUser.id,
        startDate: day,
        endDate: day,
        status: "APPROVED",
      },
    });
    const cap = await getCapacityForDay(listingId, day);
    expect(cap.max).toBe(2);
    expect(cap.booked).toBeGreaterThanOrEqual(2);
    const check = await validateReservationRange(listingId, day, day);
    expect(check.ok).toBe(false);
    await prisma.dryingReservation.deleteMany({ where: { endUserId: otherUser.id } });
    await prisma.endUser.delete({ where: { id: otherUser.id } });
  });
});
