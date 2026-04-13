import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBidInTransaction } from "@/lib/auction";

const liveProject = {
  id: "p1",
  status: "LIVE" as const,
  startPrice: new Decimal(100),
  bidStep: new Decimal(10),
};

const approvedReg = {
  status: "APPROVED" as const,
  depositPaid: true,
};

function makeTx(topBid: { amount: Decimal } | null) {
  return {
    auctionProject: {
      findUnique: vi.fn().mockResolvedValue(liveProject),
    },
    auctionRegistration: {
      findUnique: vi.fn().mockResolvedValue(approvedReg),
    },
    auctionBid: {
      findFirst: vi.fn().mockResolvedValue(topBid),
      create: vi.fn().mockImplementation(async ({ data }: { data: { amount: Decimal } }) => ({
        ...data,
        id: "bid1",
      })),
    },
  } as unknown as Prisma.TransactionClient;
}

describe("placeBidInTransaction", () => {
  it("accepts first bid at start price", async () => {
    const tx = makeTx(null);
    const bid = await placeBidInTransaction(tx, {
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    const tx = makeTx({ amount: new Decimal(100) });
    await expect(
      placeBidInTransaction(tx, {
        projectId: "p1",
        endUserId: "u1",
        amount: new Decimal(105),
      }),
    ).rejects.toThrow();
  });
});
