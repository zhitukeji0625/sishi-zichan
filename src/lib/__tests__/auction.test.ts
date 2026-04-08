import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBidInTransaction } from "@/lib/auction";

const projectId = "p1";
const endUserId = "u1";

function makeTx(overrides?: {
  topAmount?: string | null;
  bidAmount?: string;
}) {
  const topAmount = overrides?.topAmount ?? null;
  const project = {
    id: projectId,
    status: "LIVE" as const,
    startPrice: { toString: () => "100" },
    bidStep: { toString: () => "10" },
  };
  const reg = {
    status: "APPROVED" as const,
    depositPaid: true,
  };
  const top =
    topAmount === null
      ? null
      : { amount: { toString: () => topAmount } };
  return {
    auctionProject: {
      findUnique: vi.fn().mockResolvedValue(project),
    },
    auctionRegistration: {
      findUnique: vi.fn().mockResolvedValue(reg),
    },
    auctionBid: {
      findFirst: vi.fn().mockResolvedValue(top),
      create: vi.fn().mockImplementation(({ data }: { data: { amount: Decimal } }) => ({
        ...data,
        amount: data.amount,
      })),
    },
  };
}

describe("placeBidInTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    const tx = makeTx({ topAmount: null });
    const bid = await placeBidInTransaction(tx as never, {
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalled();
  });

  it("rejects bid below min increment", async () => {
    const tx = makeTx({ topAmount: "100" });
    await expect(
      placeBidInTransaction(tx as never, {
        projectId,
        endUserId,
        amount: new Decimal(105),
      }),
    ).rejects.toThrow();
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
