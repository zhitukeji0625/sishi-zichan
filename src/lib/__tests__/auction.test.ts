import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBidWithTx } from "@/lib/auction";

function createMockTx() {
  const bids: Array<{ amount: Decimal }> = [];
  const project = {
    status: "LIVE" as const,
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };
  const reg = { status: "APPROVED" as const, depositPaid: true };

  const tx = {
    auctionProject: {
      findUnique: async () => project,
    },
    auctionRegistration: {
      findUnique: async () => reg,
    },
    auctionBid: {
      findFirst: async () => {
        if (bids.length === 0) return null;
        return bids.reduce((top, b) =>
          top.amount.greaterThan(b.amount) ? top : b,
        );
      },
      create: async ({
        data,
      }: {
        data: { projectId: string; endUserId: string; amount: Decimal };
      }) => {
        bids.push({ amount: data.amount });
        return {
          id: `bid-${bids.length}`,
          projectId: data.projectId,
          endUserId: data.endUserId,
          amount: data.amount,
        };
      },
    },
  };

  return tx as unknown as Prisma.TransactionClient;
}

describe("placeBidWithTx", () => {
  it("accepts first bid at start price", async () => {
    const tx = createMockTx();
    const bid = await placeBidWithTx(tx, {
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    const tx = createMockTx();
    await placeBidWithTx(tx, {
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    await expect(
      placeBidWithTx(tx, {
        projectId: "p1",
        endUserId: "u1",
        amount: new Decimal(105),
      }),
    ).rejects.toThrow(/出价需不低于/);
  });
});
