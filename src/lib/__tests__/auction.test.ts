import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

/** 内存状态模拟当前标的最领先出价（无需真实 MySQL，CI/本地均可跑） */
const ctx = vi.hoisted(() => ({
  topBid: null as { amount: Decimal } | null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: AuctionTx) => Promise<unknown>) =>
      fn({
        auctionProject: {
          findUnique: async () => ({
            id: "p-test",
            status: "LIVE",
            startPrice: new Decimal(100),
            bidStep: new Decimal(10),
          }),
        },
        auctionRegistration: {
          findUnique: async () => ({
            status: "APPROVED",
            depositPaid: true,
          }),
        },
        auctionBid: {
          findFirst: async () => ctx.topBid,
          create: async ({
            data,
          }: {
            data: { projectId: string; endUserId: string; amount: Decimal };
          }) => {
            ctx.topBid = { amount: data.amount };
            return { id: "bid-test", ...data };
          },
        },
      }),
  },
}));

type AuctionTx = {
  auctionProject: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      status: string;
      startPrice: Decimal;
      bidStep: Decimal;
    } | null>;
  };
  auctionRegistration: {
    findUnique: (args: unknown) => Promise<{
      status: string;
      depositPaid: boolean;
    } | null>;
  };
  auctionBid: {
    findFirst: (args: unknown) => Promise<{ amount: Decimal } | null>;
    create: (args: {
      data: { projectId: string; endUserId: string; amount: Decimal };
    }) => Promise<{ id: string; projectId: string; endUserId: string; amount: Decimal }>;
  };
};

describe("placeBid", () => {
  beforeEach(() => {
    ctx.topBid = null;
  });

  it("accepts first bid at start price", async () => {
    const bid = await placeBid({
      projectId: "p-test",
      endUserId: "u-test",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    await placeBid({
      projectId: "p-test",
      endUserId: "u-test",
      amount: new Decimal(100),
    });
    await expect(
      placeBid({
        projectId: "p-test",
        endUserId: "u-test",
        amount: new Decimal(105),
      }),
    ).rejects.toThrow();
  });
});
