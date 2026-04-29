import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

const projectId = "test-project";
const endUserId = "test-user";

type BidRow = {
  projectId: string;
  endUserId: string;
  amount: Decimal;
};

const bids: BidRow[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: object) => Promise<unknown>) => {
      const tx = {
        auctionProject: {
          findUnique: async ({ where }: { where: { id: string } }) =>
            where.id === projectId
              ? {
                  id: projectId,
                  status: "LIVE",
                  startPrice: new Decimal(100),
                  bidStep: new Decimal(10),
                }
              : null,
        },
        auctionRegistration: {
          findUnique: async () => ({
            status: "APPROVED",
            depositPaid: true,
          }),
        },
        auctionBid: {
          findFirst: async ({
            where,
          }: {
            where: { projectId: string };
            orderBy: { amount: "desc" };
          }) => {
            const list = bids.filter((b) => b.projectId === where.projectId);
            if (list.length === 0) return null;
            return list.reduce((a, b) =>
              a.amount.greaterThan(b.amount) ? a : b,
            );
          },
          create: async ({
            data,
          }: {
            data: { projectId: string; endUserId: string; amount: Decimal };
          }) => {
            bids.push({ ...data });
            return { id: `bid-${bids.length}`, ...data };
          },
        },
      };
      return fn(tx);
    },
  },
}));

import { placeBid } from "@/lib/auction";

describe("placeBid", () => {
  beforeEach(() => {
    bids.length = 0;
  });

  it("accepts first bid at start price", async () => {
    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
