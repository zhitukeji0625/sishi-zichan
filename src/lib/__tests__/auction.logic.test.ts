import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBidWithClient } from "@/lib/auction";

function mockTx(overrides: {
  project?: Partial<{
    id: string;
    status: string;
    startPrice: Decimal;
    bidStep: Decimal;
  }>;
  reg?: { status: string; depositPaid: boolean } | null;
  topBidAmount?: Decimal | null;
}) {
  const project = {
    id: "p1",
    status: "LIVE",
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
    ...overrides.project,
  };
  const tx = {
    auctionProject: {
      findUnique: vi.fn().mockResolvedValue(project),
    },
    auctionRegistration: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.reg === undefined
          ? { status: "APPROVED", depositPaid: true }
          : overrides.reg,
      ),
    },
    auctionBid: {
      findFirst: vi.fn().mockResolvedValue(
        overrides.topBidAmount == null
          ? null
          : { amount: overrides.topBidAmount },
      ),
      create: vi.fn().mockImplementation(({ data }) => ({
        id: "bid1",
        ...data,
      })),
    },
  };
  return tx as unknown as Prisma.TransactionClient;
}

describe("placeBidWithClient", () => {
  it("accepts first bid at start price", async () => {
    const tx = mockTx({});
    const bid = await placeBidWithClient(tx, {
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects first bid below start price", async () => {
    const tx = mockTx({});
    await expect(
      placeBidWithClient(tx, {
        projectId: "p1",
        endUserId: "u1",
        amount: new Decimal(99),
      }),
    ).rejects.toThrow(/出价需不低于/);
  });

  it("rejects bid below min increment when a higher bid exists", async () => {
    const tx = mockTx({ topBidAmount: new Decimal(100) });
    await expect(
      placeBidWithClient(tx, {
        projectId: "p1",
        endUserId: "u1",
        amount: new Decimal(105),
      }),
    ).rejects.toThrow(/出价需不低于/);
  });

  it("requires next bid to be top + bidStep", async () => {
    const tx = mockTx({ topBidAmount: new Decimal(100) });
    const ok = await placeBidWithClient(tx, {
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(110),
    });
    expect(ok.amount.toString()).toBe("110");
  });
});
