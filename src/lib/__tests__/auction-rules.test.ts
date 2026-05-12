import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinimumNextBidAmount } from "@/lib/auction";

describe("computeMinimumNextBidAmount", () => {
  it("无历史出价时为起拍价", () => {
    const min = computeMinimumNextBidAmount({
      startPrice: new Decimal("100"),
      bidStep: new Decimal("10"),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("已有出价时为最高价加价幅", () => {
    const min = computeMinimumNextBidAmount({
      startPrice: new Decimal("100"),
      bidStep: new Decimal("10"),
      highestBidAmount: new Decimal("100"),
    });
    expect(min.toString()).toBe("110");
  });

  it("支持小数起拍价与加价幅", () => {
    const min = computeMinimumNextBidAmount({
      startPrice: new Decimal("99.5"),
      bidStep: new Decimal("0.5"),
      highestBidAmount: new Decimal("100"),
    });
    expect(min.toString()).toBe("100.5");
  });
});
