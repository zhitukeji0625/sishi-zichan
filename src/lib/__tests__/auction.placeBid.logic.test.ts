import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

const state = vi.hoisted(() => ({
  project: null as null | {
    id: string;
    status: string;
    startPrice: Decimal;
    bidStep: Decimal;
  },
  reg: null as null | { status: string; depositPaid: boolean },
  top: null as null | { amount: Decimal },
  created: [] as Array<{ projectId: string; endUserId: string; amount: Decimal }>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        auctionProject: {
          findUnique: async () => state.project,
        },
        auctionRegistration: {
          findUnique: async () => state.reg,
        },
        auctionBid: {
          findFirst: async () => state.top,
          create: async ({
            data,
          }: {
            data: { projectId: string; endUserId: string; amount: Decimal };
          }) => {
            state.created.push(data);
            const bid = { id: `bid-${state.created.length}`, ...data };
            state.top = { amount: data.amount };
            return bid;
          },
        },
      };
      return fn(tx);
    },
  },
}));

import { placeBid } from "@/lib/auction";

describe("placeBid（无数据库）", () => {
  beforeEach(() => {
    state.project = {
      id: "p1",
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    };
    state.reg = { status: "APPROVED", depositPaid: true };
    state.top = null;
    state.created = [];
  });

  it("项目不存在时拒绝", async () => {
    state.project = null;
    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(100) }),
    ).rejects.toThrow("竞拍未在进行中");
  });

  it("非 LIVE 状态拒绝", async () => {
    state.project = {
      id: "p1",
      status: "DRAFT",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    };
    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(100) }),
    ).rejects.toThrow("竞拍未在进行中");
  });

  it("未报名或未缴保证金拒绝", async () => {
    state.reg = null;
    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(100) }),
    ).rejects.toThrow("无出价资格");
  });

  it("尚无出价时不得低于起拍价", async () => {
    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(99.99) }),
    ).rejects.toThrow("出价需不低于");
  });

  it("尚无出价时接受等于起拍价", async () => {
    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("已有最高价时须满足加价步长", async () => {
    state.top = { amount: new Decimal(100) };
    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow("出价需不低于");
    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(110),
    });
    expect(bid.amount.toString()).toBe("110");
  });
});
