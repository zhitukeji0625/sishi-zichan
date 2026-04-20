import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBidInTransaction } from "@/lib/auction";

function makeTx(overrides: {
  topBidAmount?: string | null;
}): Prisma.TransactionClient {
  const project = {
    id: "p1",
    status: "LIVE" as const,
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };
  const reg = {
    status: "APPROVED" as const,
    depositPaid: true,
  };
  const top =
    overrides.topBidAmount == null
      ? null
      : { amount: new Decimal(overrides.topBidAmount) };

  return {
    auctionProject: {
      findUnique: vi.fn().mockResolvedValue(project),
    },
    auctionRegistration: {
      findUnique: vi.fn().mockResolvedValue(reg),
    },
    auctionBid: {
      findFirst: vi.fn().mockResolvedValue(top),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: "bid1",
        ...data,
        amount: data.amount,
      })),
    },
  } as unknown as Prisma.TransactionClient;
}

describe("placeBidInTransaction", () => {
  it("accepts first bid at start price", async () => {
    const tx = makeTx({ topBidAmount: null });
    const bid = await placeBidInTransaction(tx, {
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalledTimes(1);
  });

  it("rejects bid below min increment", async () => {
    const tx = makeTx({ topBidAmount: "100" });
    await expect(
      placeBidInTransaction(tx, {
        projectId: "p1",
        endUserId: "u1",
        amount: new Decimal(105),
      }),
    ).rejects.toThrow(/出价需不低于/);
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
