import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { placeBid } from "@/lib/auction";

describe("placeBid", () => {
  beforeEach(() => {
    mockTransaction.mockReset();
  });

  it("accepts first bid at start price", async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        auctionProject: {
          findUnique: vi.fn().mockResolvedValue({
            status: "LIVE",
            startPrice: { toString: () => "100" },
            bidStep: { toString: () => "10" },
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
          create: vi.fn().mockResolvedValue({ amount: new Decimal("100") }),
        },
      };
      return fn(tx);
    });

    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        auctionProject: {
          findUnique: vi.fn().mockResolvedValue({
            status: "LIVE",
            startPrice: { toString: () => "100" },
            bidStep: { toString: () => "10" },
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
            amount: { toString: () => "100" },
          }),
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
  });
});
