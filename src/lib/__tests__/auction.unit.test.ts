import { describe, it, expect, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import { placeBidInTransaction } from "@/lib/auction";

function mockTx(overrides: {
  project?: Partial<{
    id: string;
    status: string;
    startPrice: Decimal;
    bidStep: Decimal;
  }>;
  reg?: { status: string; depositPaid: boolean } | null;
  topBid?: { amount: Decimal } | null;
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
      findFirst: vi.fn().mockResolvedValue(overrides.topBid ?? null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data, id: "bid-new" }),
      ),
    },
  };
  return tx as unknown as Prisma.TransactionClient;
}

describe("placeBidInTransaction", () => {
  it("accepts first bid at start price", async () => {
    const tx = mockTx({});
    const bid = await placeBidInTransaction(tx, {
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
    await expect(
      placeBidInTransaction(tx, {
        projectId: "p1",
        endUserId: "u1",
        amount: new Decimal(105),
      }),
    ).rejects.toThrow(/出价需不低于/);
  });
});
