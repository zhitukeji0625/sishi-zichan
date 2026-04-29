import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minimumNextBidAmount } from "@/lib/auction";

describe("minimumNextBidAmount (竞拍加价规则)", () => {
  const startPrice = new Decimal(100);
  const bidStep = new Decimal(10);

  it("首笔出价下限为起拍价", () => {
    const min = minimumNextBidAmount({
      startPrice,
      bidStep,
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("已有最高价后，下限为最高价加加价幅度", () => {
    const min = minimumNextBidAmount({
      startPrice,
      bidStep,
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });

  it("低于下限的金额不满足出价规则（与 placeBid 校验一致）", () => {
    const minAfterFirst = minimumNextBidAmount({
      startPrice,
      bidStep,
      highestBidAmount: new Decimal(100),
    });
    const attempt = new Decimal(105);
    expect(attempt.lessThan(minAfterFirst)).toBe(true);
  });
});
