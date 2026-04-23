import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { placeBid } from "@/lib/auction";
import { prisma } from "@/lib/prisma";

type MockTx = {
  auctionProject: { findUnique: ReturnType<typeof vi.fn> };
  auctionRegistration: { findUnique: ReturnType<typeof vi.fn> };
  auctionBid: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

function highestBid(bids: { amount: Decimal }[]) {
  if (bids.length === 0) return null;
  return bids.reduce((best, b) =>
    new Decimal(b.amount.toString()).gt(new Decimal(best.amount.toString())) ? b : best,
  );
}

function createMockTx(opts: {
  project?: Partial<{ status: string; startPrice: Decimal; bidStep: Decimal }>;
  reg?: Partial<{ status: string; depositPaid: boolean }> | null;
  existingBids: { amount: Decimal }[];
}): MockTx {
  const project = {
    status: "LIVE",
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
    ...opts.project,
  };
  const reg =
    opts.reg === null
      ? null
      : {
          status: "APPROVED",
          depositPaid: true,
          ...opts.reg,
        };
  const bids = [...opts.existingBids];

  return {
    auctionProject: {
      findUnique: vi.fn(async () => project),
    },
    auctionRegistration: {
      findUnique: vi.fn(async () => reg),
    },
    auctionBid: {
      findFirst: vi.fn(async () => {
        const top = highestBid(bids);
        if (!top) return null;
        return { amount: top.amount, id: "top", projectId: "p", endUserId: "u" };
      }),
      create: vi.fn(async ({ data }: { data: { projectId: string; endUserId: string; amount: Decimal } }) => {
        bids.push({ amount: data.amount });
        return { id: "new-bid", ...data };
      }),
    },
  };
}

describe("placeBid", () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockReset();
  });

  it("accepts first bid at start price", async () => {
    const tx = createMockTx({ existingBids: [] });
    vi.mocked(prisma.$transaction).mockImplementation(async (cb) =>
      (cb as (t: MockTx) => Promise<unknown>)(tx),
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
    const tx = createMockTx({ existingBids: [{ amount: new Decimal(100) }] });
    vi.mocked(prisma.$transaction).mockImplementation(async (cb) =>
      (cb as (t: MockTx) => Promise<unknown>)(tx),
    );

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow();
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
