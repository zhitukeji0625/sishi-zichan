import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBid } from "@/lib/auction";

describe("computeMinNextBid", () => {
  it("首口最低价为起拍价", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("已有最高价时为最高价加加价幅度", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });

  it("支持小数起拍与步长", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal("0.01"),
      bidStep: new Decimal("0.01"),
      highestBidAmount: new Decimal("0.05"),
    });
    expect(min.toString()).toBe("0.06");
  });
});
