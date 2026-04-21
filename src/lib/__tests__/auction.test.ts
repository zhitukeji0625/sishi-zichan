import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

const { prismaMock, bidAmounts, resetBidState } = vi.hoisted(() => {
  const bidAmounts: Decimal[] = [];
  const tx = {
    auctionProject: {
      findUnique: vi.fn(async () => ({
        id: "p1",
        status: "LIVE",
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
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
        if (bidAmounts.length === 0) return null;
        const top = bidAmounts.reduce((a, b) => (a.greaterThan(b) ? a : b));
        return { amount: top };
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { amount: Decimal; projectId: string; endUserId: string };
        }) => {
          bidAmounts.push(data.amount);
          return {
            id: `bid-${bidAmounts.length}`,
            projectId: data.projectId,
            endUserId: data.endUserId,
            amount: data.amount,
          };
        },
      ),
    },
  };
  const prismaMock = {
    ...tx,
    $transaction: vi.fn(async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return {
    prismaMock,
    bidAmounts,
    resetBidState: () => {
      bidAmounts.length = 0;
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

describe("placeBid", () => {
  beforeEach(() => {
    resetBidState();
    vi.mocked(prismaMock.auctionBid.findFirst).mockImplementation(async () => {
      if (bidAmounts.length === 0) return null;
      const top = bidAmounts.reduce((a, b) => (a.greaterThan(b) ? a : b));
      return { amount: top };
    });
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
    vi.mocked(prismaMock.auctionBid.findFirst).mockResolvedValueOnce({
      amount: new Decimal(100),
    });
    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
