import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

const mockFindUniqueProject = vi.fn();
const mockFindUniqueReg = vi.fn();
const mockFindFirstBid = vi.fn();
const mockCreateBid = vi.fn();

const mockTx = {
  auctionProject: { findUnique: mockFindUniqueProject },
  auctionRegistration: { findUnique: mockFindUniqueReg },
  auctionBid: { findFirst: mockFindFirstBid, create: mockCreateBid },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: <T>(fn: (tx: typeof mockTx) => Promise<T>) => fn(mockTx),
  },
}));

const projectId = "proj-1";
const endUserId = "user-1";

function stubLiveProject() {
  mockFindUniqueProject.mockResolvedValue({
    id: projectId,
    status: "LIVE",
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  });
}

function stubApprovedRegistration() {
  mockFindUniqueReg.mockResolvedValue({
    status: "APPROVED",
    depositPaid: true,
  });
}

describe("placeBid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubLiveProject();
    stubApprovedRegistration();
  });

  it("accepts first bid at start price", async () => {
    mockFindFirstBid.mockResolvedValue(null);
    mockCreateBid.mockResolvedValue({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });

    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });

    expect(bid.amount.toString()).toBe("100");
    expect(mockCreateBid).toHaveBeenCalledTimes(1);
  });

  it("rejects bid below min increment", async () => {
    mockFindFirstBid.mockResolvedValue({
      amount: new Decimal(100),
    });

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow();
    expect(mockCreateBid).not.toHaveBeenCalled();
  });
});
