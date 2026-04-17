import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBidInTransaction } from "@/lib/auction";

function createMockTx(overrides: {
  project?: Partial<{
    id: string;
    status: string;
    startPrice: Decimal;
    bidStep: Decimal;
  }>;
  reg?: Partial<{
    status: string;
    depositPaid: boolean;
  }> | null;
  topBid?: { amount: Decimal } | null;
}) {
  const project = {
    id: "p1",
    status: "LIVE",
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
    ...overrides.project,
  };
  const reg =
    overrides.reg === null
      ? null
      : {
          status: "APPROVED",
          depositPaid: true,
          ...overrides.reg,
        };

  return {
    auctionProject: {
      findUnique: vi.fn().mockResolvedValue(project),
    },
    auctionRegistration: {
      findUnique: vi.fn().mockResolvedValue(reg),
    },
    auctionBid: {
      findFirst: vi.fn().mockResolvedValue(overrides.topBid ?? null),
      create: vi.fn().mockImplementation(async ({ data }: { data: { amount: Decimal } }) => ({
        id: "bid1",
        ...data,
      })),
    },
  };
}

describe("placeBidInTransaction", () => {
  const projectId = "p1";
  const endUserId = "u1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    const tx = createMockTx({});
    const bid = await placeBidInTransaction(tx as never, {
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalled();
  });

  it("rejects bid below min increment when a prior bid exists", async () => {
    const tx = createMockTx({
      topBid: { amount: new Decimal(100) },
    });
    await expect(
      placeBidInTransaction(tx as never, {
        projectId,
        endUserId,
        amount: new Decimal(105),
      }),
    ).rejects.toThrow(/出价需不低于 110/);
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });

  it("requires min next after existing top bid", async () => {
    const tx = createMockTx({
      topBid: { amount: new Decimal(100) },
    });
    await expect(
      placeBidInTransaction(tx as never, {
        projectId,
        endUserId,
        amount: new Decimal(109),
      }),
    ).rejects.toThrow(/出价需不低于 110/);
  });
});
