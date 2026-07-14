import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";
import { validateReservationRange, validateAdvanceBooking } from "@/lib/drying";
import { refreshAuctionProjectStatuses } from "@/lib/cron";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("integration flows", () => {
  let orgId: string;
  let assetId: string;
  let projectId: string;
  let userId: string;
  let listingId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "集成测试组织", code: `IT${Date.now()}`, level: "COMPANY" },
    });
    orgId = org.id;
    const asset = await prisma.asset.create({
      data: {
        orgId,
        type: "LAND",
        name: "集成测试资产",
        locationText: "测试地",
        status: "IDLE",
      },
    });
    assetId = asset.id;
    const dryingAsset = await prisma.asset.create({
      data: {
        orgId,
        type: "DRYING_FIELD",
        name: "集成测试晒场",
        locationText: "晒场",
        status: "IDLE",
      },
    });
    const listing = await prisma.dryingFieldListing.create({
      data: {
        assetId: dryingAsset.id,
        status: "OPERATING",
        capacityRules: {
          create: { startDate: new Date("2026-01-01"), endDate: new Date("2027-12-31"), maxPeople: 2 },
        },
        bookingRules: { create: { maxAdvanceDays: 7 } },
      },
    });
    listingId = listing.id;
    const user = await prisma.endUser.create({
      data: {
        phone: `198${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "集成测试用户",
      },
    });
    userId = user.id;
    const project = await prisma.auctionProject.create({
      data: {
        code: `ITAP${Date.now()}`,
        assetId,
        startPrice: new Decimal(1000),
        bidStep: new Decimal(100),
        depositAmount: new Decimal(50),
        startsAt: new Date(Date.now() - 60000),
        endsAt: new Date(Date.now() + 86400000),
        status: "LIVE",
      },
    });
    projectId = project.id;
    await prisma.auctionRegistration.create({
      data: { projectId, endUserId: userId, status: "APPROVED", depositPaid: true },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { endUserId: userId } });
    await prisma.auctionBid.deleteMany({ where: { projectId } });
    await prisma.auctionRegistration.deleteMany({ where: { projectId } });
    await prisma.auctionResult.deleteMany({ where: { projectId } });
    await prisma.auctionProject.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.dryingReservation.deleteMany({ where: { listingId } });
    await prisma.dryingCapacityRule.deleteMany({ where: { listingId } });
    await prisma.dryingBookingRule.deleteMany({ where: { listingId } });
    await prisma.dryingFieldListing.delete({ where: { id: listingId } }).catch(() => {});
    await prisma.asset.deleteMany({ where: { orgId } });
    await prisma.endUser.delete({ where: { id: userId } }).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("refreshAuctionProjectStatuses advances SCHEDULED to LIVE", async () => {
    const scheduled = await prisma.auctionProject.create({
      data: {
        code: `SCH${Date.now()}`,
        assetId,
        startPrice: new Decimal(500),
        bidStep: new Decimal(50),
        depositAmount: new Decimal(20),
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 86400000),
        status: "SCHEDULED",
      },
    });
    await refreshAuctionProjectStatuses();
    const updated = await prisma.auctionProject.findUnique({ where: { id: scheduled.id } });
    expect(updated?.status).toBe("LIVE");
    await prisma.auctionProject.delete({ where: { id: scheduled.id } });
  });

  it("placeBid rejects unapproved registration", async () => {
    const pendingUser = await prisma.endUser.create({
      data: { phone: `197${Date.now().toString().slice(-8)}`, passwordHash: "x", name: "待审用户" },
    });
    await prisma.auctionRegistration.create({
      data: { projectId, endUserId: pendingUser.id, status: "PENDING", depositPaid: false },
    });
    await expect(
      placeBid({ projectId, endUserId: pendingUser.id, amount: new Decimal(1000) }),
    ).rejects.toThrow("无出价资格");
    await prisma.auctionRegistration.deleteMany({ where: { endUserId: pendingUser.id } });
    await prisma.endUser.delete({ where: { id: pendingUser.id } });
  });

  it("validateAdvanceBooking rejects dates beyond horizon", async () => {
    const tooFar = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const check = await validateAdvanceBooking(listingId, tooFar);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain("最多可提前");
  });

  it("validateReservationRange detects full capacity", async () => {
    const start = new Date("2026-08-01");
    const end = new Date("2026-08-01");
    const fillerIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const phone = `19${String(Date.now() + i).slice(-9)}`;
      const u = await prisma.endUser.create({
        data: { phone, passwordHash: "x", name: `用户${i}` },
      });
      fillerIds.push(u.id);
      await prisma.dryingReservation.create({
        data: { listingId, endUserId: u.id, startDate: start, endDate: end, status: "APPROVED" },
      });
    }
    const check = await validateReservationRange(listingId, start, end);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain("已满");
    await prisma.dryingReservation.deleteMany({ where: { endUserId: { in: fillerIds } } });
    await prisma.endUser.deleteMany({ where: { id: { in: fillerIds } } });
  });

  it("auction result with winner refunds non-winners only", async () => {
    const winnerId = userId;
    const loserUser = await prisma.endUser.create({
      data: { phone: `195${Date.now().toString().slice(-8)}`, passwordHash: "x", name: "落选用户" },
    });
    const loserId = loserUser.id;
    await prisma.auctionRegistration.create({
      data: { projectId, endUserId: loserId, status: "APPROVED", depositPaid: true },
    });
    await prisma.auctionBid.create({
      data: { projectId, endUserId: winnerId, amount: new Decimal(1200) },
    });
    await prisma.payment.create({
      data: {
        orderNo: `DEP${Date.now()}W`,
        amount: new Decimal(50),
        purpose: "AUCTION_DEPOSIT",
        status: "SUCCESS",
        endUserId: winnerId,
        auctionProjectId: projectId,
        paidAt: new Date(),
        channel: "ABC_MOCK",
      },
    });
    await prisma.payment.create({
      data: {
        orderNo: `DEP${Date.now()}L`,
        amount: new Decimal(50),
        purpose: "AUCTION_DEPOSIT",
        status: "SUCCESS",
        endUserId: loserId,
        auctionProjectId: projectId,
        paidAt: new Date(),
        channel: "ABC_MOCK",
      },
    });
    const result = await prisma.auctionResult.create({
      data: { projectId, winnerId: winnerId, status: "PUBLISHED", publishedAt: new Date() },
    });
    const allRegs = await prisma.auctionRegistration.findMany({
      where: { projectId, depositPaid: true, endUserId: { not: result.winnerId ?? undefined } },
    });
    expect(allRegs.length).toBe(1);
    expect(allRegs[0].endUserId).toBe(loserId);
    await prisma.auctionResult.delete({ where: { id: result.id } });
    await prisma.auctionBid.deleteMany({ where: { projectId, endUserId: winnerId } });
    await prisma.auctionRegistration.deleteMany({ where: { endUserId: loserId } });
    await prisma.payment.deleteMany({ where: { endUserId: { in: [winnerId, loserId] }, auctionProjectId: projectId } });
    await prisma.endUser.delete({ where: { id: loserId } });
  });
});
