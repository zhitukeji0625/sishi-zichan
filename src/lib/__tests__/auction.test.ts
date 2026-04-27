import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { placeBid } from "@/lib/auction";

function mockTx(overrides: {
  project?: Record<string, unknown>;
  registration?: Record<string, unknown> | null;
  topBid?: { amount: Decimal } | null;
  createdBid?: { amount: Decimal };
}) {
  const project = {
    id: "p1",
    status: "LIVE",
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
    ...overrides.project,
  };
  const registration = {
    status: "APPROVED",
    depositPaid: true,
    ...overrides.registration,
  };
  const topBid = overrides.topBid ?? null;
  const createdBid = overrides.createdBid ?? { amount: new Decimal(100) };

  return {
    auctionProject: {
      findUnique: vi.fn().mockResolvedValue(project),
    },
    auctionRegistration: {
      findUnique: vi.fn().mockResolvedValue(registration),
    },
    auctionBid: {
      findFirst: vi.fn().mockResolvedValue(topBid),
      create: vi.fn().mockResolvedValue(createdBid),
    },
  };
}

describe("placeBid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    const tx = mockTx({});
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => fn(tx as never));

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
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => fn(tx as never));

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
