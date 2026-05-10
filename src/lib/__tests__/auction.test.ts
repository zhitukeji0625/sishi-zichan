import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { placeBid } from "@/lib/auction";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

const mockTransaction = vi.mocked(prisma.$transaction);

describe("placeBid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    const project = {
      id: "p1",
      status: "LIVE" as const,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    };
    const reg = { status: "APPROVED" as const, depositPaid: true };

    mockTransaction.mockImplementation(async (cb) => {
      const tx = {
        auctionProject: {
          findUnique: vi.fn().mockResolvedValue(project),
        },
        auctionRegistration: {
          findUnique: vi.fn().mockResolvedValue(reg),
        },
        auctionBid: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "b1",
            projectId: "p1",
            endUserId: "u1",
            amount: new Decimal(100),
          }),
        },
      };
      return cb(tx as never);
    });

    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    const project = {
      id: "p1",
      status: "LIVE" as const,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    };
    const reg = { status: "APPROVED" as const, depositPaid: true };
    const topBid = { amount: new Decimal(100) };

    mockTransaction.mockImplementation(async (cb) => {
      const tx = {
        auctionProject: {
          findUnique: vi.fn().mockResolvedValue(project),
        },
        auctionRegistration: {
          findUnique: vi.fn().mockResolvedValue(reg),
        },
        auctionBid: {
          findFirst: vi.fn().mockResolvedValue(topBid),
          create: vi.fn(),
        },
      };
      return cb(tx as never);
    });

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow("出价需不低于");
  });
});
