import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { placeBid } from "@/lib/auction";
import { prisma } from "@/lib/prisma";

function mockTx(overrides: {
  project?: {
    status: string;
    startPrice: Decimal;
    bidStep: Decimal;
  } | null;
  reg?: {
    status: string;
    depositPaid: boolean;
  } | null;
  topBid?: { amount: Decimal } | null;
  createdBid?: { id: string; projectId: string; endUserId: string; amount: Decimal };
}) {
  const project = overrides.project ?? {
    status: "LIVE",
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };
  const reg = overrides.reg ?? {
    status: "APPROVED",
    depositPaid: true,
  };
  const topBid = overrides.topBid ?? null;
  return {
    auctionProject: {
      findUnique: vi.fn().mockResolvedValue(project),
    },
    auctionRegistration: {
      findUnique: vi.fn().mockResolvedValue(reg),
    },
    auctionBid: {
      findFirst: vi.fn().mockResolvedValue(topBid),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: { projectId: string; endUserId: string; amount: Decimal } }) =>
          Promise.resolve(
            overrides.createdBid ?? {
              id: "bid-mock",
              projectId: data.projectId,
              endUserId: data.endUserId,
              amount: data.amount,
            },
          ),
        ),
    },
  };
}

describe("placeBid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    const tx = mockTx({ topBid: null });
    vi.mocked(prisma.$transaction).mockImplementation(async (cb) =>
      (cb as (t: typeof tx) => Promise<unknown>)(tx),
    );

    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalled();
  });

  it("rejects bid below min increment", async () => {
    const tx = mockTx({
      topBid: { amount: new Decimal(100) },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (cb) =>
      (cb as (t: typeof tx) => Promise<unknown>)(tx),
    );

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
