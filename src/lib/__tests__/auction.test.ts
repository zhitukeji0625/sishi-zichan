import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minRequiredBidAmount } from "@/lib/auction";

const project = {
  startPrice: new Decimal(100),
  bidStep: new Decimal(10),
};

describe("minRequiredBidAmount", () => {
  it("is start price when there is no prior bid", () => {
    expect(minRequiredBidAmount(project, null).toString()).toBe("100");
  });

  it("is highest bid plus step when there is a prior bid", () => {
    expect(
      minRequiredBidAmount(project, new Decimal(100)).toString(),
    ).toBe("110");
  });
});

describe("placeBid rules (integration)", () => {
  const shouldRun = process.env.RUN_DB_TESTS === "1";

  it.skipIf(!shouldRun)(
    "accepts first bid at start price and rejects below min increment",
    async () => {
      const { PrismaClient } = await import("@prisma/client");
      const { placeBid } = await import("@/lib/auction");
      const prisma = new PrismaClient();

      const org = await prisma.organization.create({
        data: { name: "测试组织", code: `T${Date.now()}`, level: "COMPANY" },
      });
      const orgId = org.id;
      const asset = await prisma.asset.create({
        data: {
          orgId,
          type: "LAND",
          name: "测试资产",
          locationText: "测试",
          status: "IDLE",
        },
      });
      const assetId = asset.id;
      const user = await prisma.endUser.create({
        data: {
          phone: `199${Date.now().toString().slice(-8)}`,
          passwordHash: "x",
          name: "测试用户",
        },
      });
      const userId = user.id;
      const proj = await prisma.auctionProject.create({
        data: {
          code: `TAP${Date.now()}`,
          assetId,
          startPrice: new Decimal(100),
          bidStep: new Decimal(10),
          depositAmount: new Decimal(5),
          startsAt: new Date(Date.now() - 1000),
          endsAt: new Date(Date.now() + 86400000),
          status: "LIVE",
        },
      });
      const projectId = proj.id;
      await prisma.auctionRegistration.create({
        data: {
          projectId,
          endUserId: userId,
          status: "APPROVED",
          depositPaid: true,
        },
      });

      try {
        const bid = await placeBid({
          projectId,
          endUserId: userId,
          amount: new Decimal(100),
        });
        expect(bid.amount.toString()).toBe("100");

        await expect(
          placeBid({ projectId, endUserId: userId, amount: new Decimal(105) }),
        ).rejects.toThrow();
      } finally {
        await prisma.auctionBid.deleteMany({ where: { projectId } });
        await prisma.auctionRegistration.deleteMany({ where: { projectId } });
        await prisma.auctionProject.delete({ where: { id: projectId } });
        await prisma.asset.delete({ where: { id: assetId } });
        await prisma.endUser.delete({ where: { id: userId } });
        await prisma.organization.delete({ where: { id: orgId } });
        await prisma.$disconnect();
      }
    },
  );
});
