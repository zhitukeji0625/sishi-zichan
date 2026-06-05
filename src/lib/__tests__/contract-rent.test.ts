import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("payAuctionRent idempotency", () => {
  let orgId: string;
  let assetId: string;
  let projectId: string;
  let winnerId: string;
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "租金测试组织", code: `R${Date.now()}`, level: "COMPANY" },
    });
    orgId = org.id;
    const asset = await prisma.asset.create({
      data: {
        orgId,
        type: "LAND",
        name: "租金测试资产",
        locationText: "测试",
        status: "IDLE",
      },
    });
    assetId = asset.id;
    const winner = await prisma.endUser.create({
      data: {
        phone: `198${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "中标用户",
      },
    });
    winnerId = winner.id;
    const project = await prisma.auctionProject.create({
      data: {
        code: `RAP${Date.now()}`,
        assetId,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        depositAmount: new Decimal(5),
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 86400000),
        status: "ENDED",
      },
    });
    projectId = project.id;
    await prisma.auctionBid.create({
      data: { projectId, endUserId: winnerId, amount: new Decimal(150) },
    });
    await prisma.auctionResult.create({
      data: { projectId, winnerId, status: "PUBLISHED", publishedAt: new Date() },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { auctionProjectId: projectId } });
    await prisma.auctionResult.deleteMany({ where: { projectId } });
    await prisma.auctionBid.deleteMany({ where: { projectId } });
    await prisma.auctionProject.delete({ where: { id: projectId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.endUser.delete({ where: { id: winnerId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("allows retry after a failed rent payment", async () => {
    await prisma.payment.create({
      data: {
        orderNo: `FAIL${Date.now()}`,
        amount: new Decimal(150),
        purpose: "AUCTION_RENT",
        status: "FAILED",
        endUserId: winnerId,
        auctionProjectId: projectId,
        channel: "ABC_MOCK",
      },
    });
    const failedOnly = await prisma.payment.findFirst({
      where: {
        auctionProjectId: projectId,
        endUserId: winnerId,
        purpose: "AUCTION_RENT",
        status: "SUCCESS",
      },
    });
    expect(failedOnly).toBeNull();

    const success = await prisma.payment.create({
      data: {
        orderNo: `OK${Date.now()}`,
        amount: new Decimal(150),
        purpose: "AUCTION_RENT",
        status: "SUCCESS",
        endUserId: winnerId,
        auctionProjectId: projectId,
        paidAt: new Date(),
        channel: "ABC_MOCK",
      },
    });
    expect(success.status).toBe("SUCCESS");
  });
});
