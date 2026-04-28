import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { placeBid } from "@/lib/auction";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

describe("placeBid", () => {
  const projectId = "proj-1";
  const endUserId = "user-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      const tx = {
        auctionProject: {
          findUnique: vi.fn().mockResolvedValue({
            id: projectId,
            status: "LIVE",
            startPrice: new Decimal(100),
            bidStep: new Decimal(10),
          }),
        },
        auctionRegistration: {
          findUnique: vi.fn().mockResolvedValue({
            status: "APPROVED",
            depositPaid: true,
          }),
        },
        auctionBid: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => ({
            id: "bid-1",
            ...(data as object),
          })),
        },
      };
      return fn(tx as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      const tx = {
        auctionProject: {
          findUnique: vi.fn().mockResolvedValue({
            id: projectId,
            status: "LIVE",
            startPrice: new Decimal(100),
            bidStep: new Decimal(10),
          }),
        },
        auctionRegistration: {
          findUnique: vi.fn().mockResolvedValue({
            status: "APPROVED",
            depositPaid: true,
          }),
        },
        auctionBid: {
          findFirst: vi.fn().mockResolvedValue({
            amount: new Decimal(100),
          }),
          create: vi.fn(),
        },
      };
      return fn(tx as Parameters<Parameters<typeof prisma.$transaction>[0]>[0]);
    });

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
  });
});
