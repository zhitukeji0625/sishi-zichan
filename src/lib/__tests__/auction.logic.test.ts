import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBidAmount } from "@/lib/auction";

describe("computeMinNextBidAmount", () => {
  const start = new Decimal(100);
  const step = new Decimal(10);

  it("首口为起拍价", () => {
    expect(
      computeMinNextBidAmount({
        highestBidAmount: null,
        startPrice: start,
        bidStep: step,
      }).toString(),
    ).toBe("100");
  });

  it("有最高价时为最高价加价阶", () => {
    expect(
      computeMinNextBidAmount({
        highestBidAmount: new Decimal(100),
        startPrice: start,
        bidStep: step,
      }).toString(),
    ).toBe("110");
  });

  it("支持小数阶", () => {
    expect(
      computeMinNextBidAmount({
        highestBidAmount: new Decimal("99.5"),
        startPrice: new Decimal("0.1"),
        bidStep: new Decimal("0.5"),
      }).toString(),
    ).toBe("100");
  });
});
