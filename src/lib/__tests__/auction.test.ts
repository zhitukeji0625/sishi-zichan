import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

const projectId = "test-auction-project";
const endUserId = "test-end-user";

const auctionTestDb = vi.hoisted(() => {
  const bids: { projectId: string; endUserId: string; amount: Decimal }[] = [];

  function makeTx() {
    return {
      auctionProject: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) => {
          if (id !== projectId) return null;
          return {
            id: projectId,
            status: "LIVE" as const,
            startPrice: new Decimal(100),
            bidStep: new Decimal(10),
          };
        },
      },
      auctionRegistration: {
        findUnique: async () => ({
          projectId,
          endUserId,
          status: "APPROVED" as const,
          depositPaid: true,
        }),
      },
      auctionBid: {
        findFirst: async ({ where }: { where: { projectId: string } }) => {
          if (where.projectId !== projectId || bids.length === 0) return null;
          return (
            [...bids].sort((a, b) => (a.amount.lessThan(b.amount) ? 1 : -1))[0] ?? null
          );
        },
        create: async ({
          data,
        }: {
          data: { projectId: string; endUserId: string; amount: Decimal };
        }) => {
          const row = { ...data };
          bids.push(row);
          return row;
        },
      },
    };
  }

  return {
    clearBids: () => {
      bids.length = 0;
    },
    prisma: {
      $transaction: <T,>(fn: (tx: ReturnType<typeof makeTx>) => Promise<T>) => fn(makeTx() as never),
    },
  };
});

vi.mock("@/lib/prisma", () => auctionTestDb);

beforeEach(() => {
  auctionTestDb.clearBids();
});

describe("placeBid", () => {
  it("accepts first bid at start price", async () => {
    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    await placeBid({ projectId, endUserId, amount: new Decimal(100) });
    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
