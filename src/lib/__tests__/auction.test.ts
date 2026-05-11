import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minimumNextBidAmount } from "@/lib/auction";

describe("minimumNextBidAmount", () => {
  const project = {
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("无历史出价时为起拍价", () => {
    expect(minimumNextBidAmount(project, null).toString()).toBe("100");
  });

  it("有最高价时为最高价加价幅度", () => {
    expect(
      minimumNextBidAmount(project, { amount: new Decimal(100) }).toString(),
    ).toBe("110");
  });

  it("低于下限的金额不满足出价条件", () => {
    const minNext = minimumNextBidAmount(project, { amount: new Decimal(100) });
    expect(new Decimal(105).lessThan(minNext)).toBe(true);
  });

  it("等于下限的金额满足出价条件", () => {
    const minNext = minimumNextBidAmount(project, { amount: new Decimal(100) });
    expect(new Decimal(110).lessThan(minNext)).toBe(false);
  });
});
