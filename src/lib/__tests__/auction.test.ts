import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  assertCanPlaceBid,
  minNextBidAmount,
  placeBid,
} from "@/lib/auction";

const liveProject = {
  status: "LIVE" as const,
  startPrice: new Decimal(100),
  bidStep: new Decimal(10),
};

const approvedReg = {
  status: "APPROVED" as const,
  depositPaid: true,
};

describe("minNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = minNextBidAmount(liveProject, null);
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid when present", () => {
    const min = minNextBidAmount(liveProject, new Decimal(100));
    expect(min.toString()).toBe("110");
  });
});

describe("assertCanPlaceBid", () => {
  it("accepts first bid at start price", () => {
    expect(() =>
      assertCanPlaceBid({
        project: liveProject,
        registration: approvedReg,
        topBidAmount: null,
        amount: new Decimal(100),
      }),
    ).not.toThrow();
  });

  it("rejects bid below min increment", () => {
    expect(() =>
      assertCanPlaceBid({
        project: liveProject,
        registration: approvedReg,
        topBidAmount: new Decimal(100),
        amount: new Decimal(105),
      }),
    ).toThrow(/出价需不低于/);
  });

  it("rejects when project is not live", () => {
    expect(() =>
      assertCanPlaceBid({
        project: { ...liveProject, status: "ENDED" },
        registration: approvedReg,
        topBidAmount: null,
        amount: new Decimal(100),
      }),
    ).toThrow("竞拍未在进行中");
  });

  it("rejects when registration is missing or unpaid", () => {
    expect(() =>
      assertCanPlaceBid({
        project: liveProject,
        registration: null,
        topBidAmount: null,
        amount: new Decimal(100),
      }),
    ).toThrow("无出价资格");
  });
});

describe("placeBid (integration)", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "runs against database when DATABASE_URL is set",
    async () => {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      let orgId!: string;
      let assetId!: string;
      let projectId!: string;
      let userId!: string;
      const org = await prisma.organization.create({
        data: { name: "测试组织", code: `T${Date.now()}`, level: "COMPANY" },
      });
      orgId = org.id;
      const asset = await prisma.asset.create({
        data: {
          orgId,
          type: "LAND",
          name: "测试资产",
          locationText: "测试",
          status: "IDLE",
        },
      });
      assetId = asset.id;
      const user = await prisma.endUser.create({
        data: {
          phone: `199${Date.now().toString().slice(-8)}`,
          passwordHash: "x",
          name: "测试用户",
        },
      });
      userId = user.id;
      const project = await prisma.auctionProject.create({
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
      projectId = project.id;
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
