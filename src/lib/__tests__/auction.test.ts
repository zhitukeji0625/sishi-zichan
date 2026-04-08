import { describe, it, expect, vi } from "vitest";
import type { AuctionBid, AuctionProject, AuctionRegistration } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBidWithTx } from "@/lib/auction";

const projectId = "p1";
const endUserId = "u1";

function baseProject(overrides: Partial<AuctionProject> = {}): AuctionProject {
  return {
    id: projectId,
    code: "C1",
    assetId: "a1",
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
    depositAmount: new Decimal(5),
    startsAt: new Date(),
    endsAt: new Date(),
    status: "LIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AuctionProject;
}

function baseReg(overrides: Partial<AuctionRegistration> = {}): AuctionRegistration {
  return {
    id: "r1",
    projectId,
    endUserId,
    status: "APPROVED",
    depositPaid: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AuctionRegistration;
}

function makeTx(state: { top: AuctionBid | null }) {
  return {
    auctionProject: {
      findUnique: vi.fn(async () => baseProject()),
    },
    auctionRegistration: {
      findUnique: vi.fn(async () => baseReg()),
    },
    auctionBid: {
      findFirst: vi.fn(async () => state.top),
      create: vi.fn(async ({ data }) => {
        const bid = {
          id: "bid-new",
          projectId: data.projectId,
          endUserId: data.endUserId,
          amount: data.amount,
          createdAt: new Date(),
        } as AuctionBid;
        state.top = bid;
        return bid;
      }),
    },
  };
}

describe("placeBidWithTx", () => {
  it("accepts first bid at start price", async () => {
    const state = { top: null as AuctionBid | null };
    const tx = makeTx(state);
    const bid = await placeBidWithTx(tx, {
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalledTimes(1);
  });

  it("rejects bid below min increment", async () => {
    const state = {
      top: {
        id: "bid-1",
        projectId,
        endUserId,
        amount: new Decimal(100),
        createdAt: new Date(),
      } as AuctionBid,
    };
    const tx = makeTx(state);
    await expect(
      placeBidWithTx(tx, {
        projectId,
        endUserId,
        amount: new Decimal(105),
      }),
    ).rejects.toThrow(/出价需不低于/);
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
