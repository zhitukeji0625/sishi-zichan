import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { placeBid, minNextBidAmount } from "@/lib/auction";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

describe("minNextBidAmount", () => {
  const project = {
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("uses start price when there is no prior bid", () => {
    expect(minNextBidAmount(project, null).toString()).toBe("100");
  });

  it("adds bid step to highest bid", () => {
    expect(
      minNextBidAmount(project, new Decimal(100)).toString(),
    ).toBe("110");
  });
});

describe("placeBid", () => {
  const bids: { projectId: string; amount: Decimal }[] = [];

  const mockTx = {
    auctionProject: {
      findUnique: vi.fn(
        async ({ where: { id } }: { where: { id: string } }) => ({
          id,
          status: "LIVE",
          startPrice: new Decimal(100),
          bidStep: new Decimal(10),
        }),
      ),
    },
    auctionRegistration: {
      findUnique: vi.fn(async () => ({
        status: "APPROVED",
        depositPaid: true,
      })),
    },
    auctionBid: {
      findFirst: vi.fn(
        async ({ where: { projectId } }: { where: { projectId: string } }) => {
          const forProject = bids.filter((b) => b.projectId === projectId);
          if (forProject.length === 0) return null;
          const top = forProject.reduce((a, b) =>
            a.amount.gt(b.amount) ? a : b,
          );
          return { amount: top.amount };
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { projectId: string; endUserId: string; amount: Decimal };
        }) => {
          bids.push({ projectId: data.projectId, amount: data.amount });
          return { id: "bid-mock", ...data };
        },
      ),
    },
  };

  beforeEach(() => {
    bids.length = 0;
    vi.mocked(prisma.$transaction).mockImplementation(
      (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );
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
