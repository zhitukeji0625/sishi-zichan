import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMinimumNextBidAmount, placeBid } from "@/lib/auction";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";

describe("getMinimumNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = getMinimumNextBidAmount({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid when present", () => {
    const min = getMinimumNextBidAmount({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});

function buildTxMocks(params: {
  project: {
    status: string;
    startPrice: Decimal;
    bidStep: Decimal;
  };
  reg: { status: string; depositPaid: boolean } | null;
  topBid: { amount: Decimal } | null;
}) {
  const { project, reg, topBid } = params;
  return {
    auctionProject: {
      findUnique: vi.fn().mockResolvedValue(project),
    },
    auctionRegistration: {
      findUnique: vi.fn().mockResolvedValue(reg),
    },
    auctionBid: {
      findFirst: vi.fn().mockResolvedValue(topBid),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: "bid-test",
        ...data,
      })),
    },
  };
}

describe("placeBid", () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockReset();
  });

  it("accepts first bid at start price", async () => {
    const tx = buildTxMocks({
      project: {
        status: "LIVE",
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      },
      reg: { status: "APPROVED", depositPaid: true },
      topBid: null,
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as (t: typeof tx) => Promise<unknown>)(tx),
    );

    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalledTimes(1);
  });

  it("rejects bid below min increment", async () => {
    const tx = buildTxMocks({
      project: {
        status: "LIVE",
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      },
      reg: { status: "APPROVED", depositPaid: true },
      topBid: { amount: new Decimal(100) },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as (t: typeof tx) => Promise<unknown>)(tx),
    );

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow();
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
