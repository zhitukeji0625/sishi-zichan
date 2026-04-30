import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

const { state } = vi.hoisted(() => ({
  state: { bids: [] as { amount: Decimal }[] },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async <T>(fn: (tx: Tx) => Promise<T>) => fn(createTx()),
  },
}));

type Tx = ReturnType<typeof createTx>;

function createTx() {
  return {
    auctionProject: {
      findUnique: async () => ({
        id: "project-1",
        status: "LIVE" as const,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }),
    },
    auctionRegistration: {
      findUnique: async () => ({
        projectId: "project-1",
        endUserId: "user-1",
        status: "APPROVED" as const,
        depositPaid: true,
      }),
    },
    auctionBid: {
      findFirst: async () => {
        if (state.bids.length === 0) return null;
        let top = state.bids[0];
        for (const b of state.bids) {
          if (b.amount.greaterThan(top.amount)) top = b;
        }
        return { amount: top.amount };
      },
      create: async ({ data }: { data: { projectId: string; endUserId: string; amount: Decimal } }) => {
        state.bids.push({ amount: data.amount });
        return { ...data, id: `bid-${state.bids.length}` };
      },
    },
  };
}

import { placeBid } from "@/lib/auction";

describe("placeBid", () => {
  beforeEach(() => {
    state.bids = [];
  });

  it("accepts first bid at start price", async () => {
    const bid = await placeBid({
      projectId: "project-1",
      endUserId: "user-1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    await placeBid({
      projectId: "project-1",
      endUserId: "user-1",
      amount: new Decimal(100),
    });
    await expect(
      placeBid({ projectId: "project-1", endUserId: "user-1", amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
