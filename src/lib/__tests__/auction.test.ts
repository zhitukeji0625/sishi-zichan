import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

const projectId = "test-project";
const userId = "test-user";

type BidRow = { amount: Decimal };

const bids: BidRow[] = [];

function highestBid(): BidRow | null {
  if (bids.length === 0) return null;
  return bids.reduce((best, cur) =>
    new Decimal(cur.amount.toString()).greaterThan(best.amount) ? cur : best,
  );
}

const mockTx = {
  auctionProject: {
    findUnique: vi.fn(async () => ({
      id: projectId,
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    })),
  },
  auctionRegistration: {
    findUnique: vi.fn(async () => ({
      status: "APPROVED",
      depositPaid: true,
    })),
  },
  auctionBid: {
    findFirst: vi.fn(async () => highestBid()),
    create: vi.fn(async ({ data }: { data: { projectId: string; endUserId: string; amount: Decimal } }) => {
      bids.push({ amount: data.amount });
      return {
        id: `bid-${bids.length}`,
        projectId: data.projectId,
        endUserId: data.endUserId,
        amount: data.amount,
        createdAt: new Date(),
      };
    }),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: <T>(fn: (tx: typeof mockTx) => Promise<T>) => fn(mockTx),
  },
}));

describe("placeBid", () => {
  beforeEach(() => {
    bids.length = 0;
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    const bid = await placeBid({
      projectId,
      endUserId: userId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(bids).toHaveLength(1);
  });

  it("rejects bid below min increment", async () => {
    bids.push({ amount: new Decimal(100) });
    await expect(
      placeBid({ projectId, endUserId: userId, amount: new Decimal(105) }),
    ).rejects.toThrow(/110/);
  });
});
