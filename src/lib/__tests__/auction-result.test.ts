import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("auction result review refunds", () => {
  let orgId: string;
  let assetId: string;
  let projectId: string;
  let userA: string;
  let userB: string;
  let resultId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "结果测试组织", code: `R${Date.now()}`, level: "COMPANY" },
    });
    orgId = org.id;
    const asset = await prisma.asset.create({
      data: {
        orgId,
        type: "LAND",
        name: "结果测试资产",
        locationText: "测试",
        status: "IDLE",
      },
    });
    assetId = asset.id;
    const a = await prisma.endUser.create({
      data: { phone: `198${Date.now().toString().slice(-8)}`, passwordHash: "x", name: "用户A" },
    });
    const b = await prisma.endUser.create({
      data: {
        phone: `197${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "用户B",
      },
    });
    userA = a.id;
    userB = b.id;
    const project = await prisma.auctionProject.create({
      data: {
        code: `TR${Date.now()}`,
        assetId,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        depositAmount: new Decimal(5),
        startsAt: new Date(Date.now() - 86400000),
        endsAt: new Date(Date.now() - 1000),
        status: "ENDED",
      },
    });
    projectId = project.id;
    await prisma.auctionRegistration.createMany({
      data: [
        { projectId, endUserId: userA, status: "APPROVED", depositPaid: true },
        { projectId, endUserId: userB, status: "APPROVED", depositPaid: true },
      ],
    });
    await prisma.payment.createMany({
      data: [
        {
          orderNo: `P${Date.now()}A`,
          amount: new Decimal(5),
          purpose: "AUCTION_DEPOSIT",
          status: "SUCCESS",
          endUserId: userA,
          auctionProjectId: projectId,
          paidAt: new Date(),
          channel: "ABC_MOCK",
        },
        {
          orderNo: `P${Date.now()}B`,
          amount: new Decimal(5),
          purpose: "AUCTION_DEPOSIT",
          status: "SUCCESS",
          endUserId: userB,
          auctionProjectId: projectId,
          paidAt: new Date(),
          channel: "ABC_MOCK",
        },
      ],
    });
    const result = await prisma.auctionResult.create({
      data: { projectId, winnerId: null, status: "PENDING_REVIEW" },
    });
    resultId = result.id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { auctionProjectId: projectId } });
    await prisma.auctionRegistration.deleteMany({ where: { projectId } });
    await prisma.auctionResult.deleteMany({ where: { projectId } });
    await prisma.auctionProject.delete({ where: { id: projectId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.endUser.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("refunds all deposits when there is no winner", async () => {
    const refundWhere = { projectId, depositPaid: true };
    const allRegs = await prisma.auctionRegistration.findMany({ where: refundWhere });
    expect(allRegs).toHaveLength(2);

    await prisma.$transaction(async (tx) => {
      await tx.auctionResult.update({
        where: { id: resultId },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
      for (const reg of allRegs) {
        await tx.payment.updateMany({
          where: {
            auctionProjectId: projectId,
            endUserId: reg.endUserId,
            purpose: "AUCTION_DEPOSIT",
            status: "SUCCESS",
          },
          data: { status: "REFUNDED" },
        });
      }
    });

    const refunded = await prisma.payment.count({
      where: { auctionProjectId: projectId, purpose: "AUCTION_DEPOSIT", status: "REFUNDED" },
    });
    expect(refunded).toBe(2);
  });
});
