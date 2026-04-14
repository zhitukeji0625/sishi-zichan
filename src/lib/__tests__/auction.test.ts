import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

type BidRow = { amount: string };

const { bids, resetBids } = vi.hoisted(() => {
  const bids: BidRow[] = [];
  return {
    bids,
    resetBids: () => {
      bids.length = 0;
    },
  };
});

vi.mock("@/lib/prisma", () => {
  const tx = {
    auctionProject: {
      findUnique: vi.fn(async () => ({
        id: "p1",
        status: "LIVE",
        startPrice: "100",
        bidStep: "10",
      })),
    },
    auctionRegistration: {
      findUnique: vi.fn(async () => ({
        status: "APPROVED",
        depositPaid: true,
      })),
    },
    auctionBid: {
      findFirst: vi.fn(async () => {
        if (bids.length === 0) return null;
        return bids.reduce((a, b) =>
          Number(a.amount) >= Number(b.amount) ? a : b,
        );
      }),
      create: vi.fn(async ({ data }: { data: { amount: Decimal } }) => {
        const row = { amount: data.amount.toString() };
        bids.push(row);
        return { id: `bid-${bids.length}`, ...data };
      }),
    },
  };

  return {
    prisma: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    },
  };
});

describe("placeBid", () => {
  beforeEach(() => {
    resetBids();
  });

  it("accepts first bid at start price", async () => {
    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    await expect(
      placeBid({
        projectId: "p1",
        endUserId: "u1",
        amount: new Decimal(105),
      }),
    ).rejects.toThrow();
  });
});
