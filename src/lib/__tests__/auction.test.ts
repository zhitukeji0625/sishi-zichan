import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

type MockBid = { projectId: string; endUserId: string; amount: Decimal };

const mockState: {
  projectId: string;
  endUserId: string;
  bids: MockBid[];
} = {
  projectId: "p1",
  endUserId: "u1",
  bids: [],
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const { projectId, endUserId, bids } = mockState;
      const tx = {
        auctionProject: {
          findUnique: async () => ({
            id: projectId,
            status: "LIVE",
            startPrice: new Decimal(100),
            bidStep: new Decimal(10),
          }),
        },
        auctionRegistration: {
          findUnique: async () => ({
            projectId,
            endUserId,
            status: "APPROVED",
            depositPaid: true,
          }),
        },
        auctionBid: {
          findFirst: async ({
            where,
            orderBy,
          }: {
            where: { projectId: string };
            orderBy: { amount: string };
          }) => {
            const list = bids.filter((b) => b.projectId === where.projectId);
            if (orderBy?.amount !== "desc") return list[0] ?? null;
            return (
              [...list].sort((a, b) =>
                new Decimal(b.amount.toString()).cmp(a.amount),
              )[0] ?? null
            );
          },
          create: async ({
            data,
          }: {
            data: { projectId: string; endUserId: string; amount: Decimal };
          }) => {
            bids.push({ ...data });
            return { id: "new-bid", ...data };
          },
        },
      };
      return fn(tx);
    },
  },
}));

describe("placeBid", () => {
  beforeEach(() => {
    mockState.bids = [];
  });

  it("accepts first bid at start price", async () => {
    const bid = await placeBid({
      projectId: mockState.projectId,
      endUserId: mockState.endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    mockState.bids.push({
      projectId: mockState.projectId,
      endUserId: mockState.endUserId,
      amount: new Decimal(100),
    });
    await expect(
      placeBid({
        projectId: mockState.projectId,
        endUserId: mockState.endUserId,
        amount: new Decimal(105),
      }),
    ).rejects.toThrow(/出价需不低于/);
  });
});
