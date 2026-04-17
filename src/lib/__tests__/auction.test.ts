import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";

type MockTx = {
  auctionProject: { findUnique: ReturnType<typeof vi.fn> };
  auctionRegistration: { findUnique: ReturnType<typeof vi.fn> };
  auctionBid: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

describe("placeBid", () => {
  const projectId = "p1";
  const endUserId = "u1";

  function buildTx(mocks: {
    topBid: { amount: Decimal } | null;
    project?: Partial<{
      status: string;
      startPrice: Decimal;
      bidStep: Decimal;
    }>;
    reg?: Partial<{ status: string; depositPaid: boolean }> | null;
  }): MockTx {
    const project = {
      id: projectId,
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      ...mocks.project,
    };
    const reg =
      mocks.reg === null
        ? null
        : {
            status: "APPROVED",
            depositPaid: true,
            ...mocks.reg,
          };
    return {
      auctionProject: {
        findUnique: vi.fn().mockResolvedValue(project),
      },
      auctionRegistration: {
        findUnique: vi.fn().mockResolvedValue(reg),
      },
      auctionBid: {
        findFirst: vi.fn().mockResolvedValue(mocks.topBid),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          id: "bid1",
          ...data,
        })),
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    const tx = buildTx({ topBid: null });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as unknown as (t: MockTx) => Promise<unknown>)(tx),
    );

    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalled();
  });

  it("rejects bid below min increment", async () => {
    const tx = buildTx({ topBid: { amount: new Decimal(100) } });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as unknown as (t: MockTx) => Promise<unknown>)(tx),
    );

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
  });
});
