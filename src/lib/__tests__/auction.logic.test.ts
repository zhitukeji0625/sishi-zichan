import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBidAmount } from "@/lib/auction";

describe("computeMinNextBidAmount", () => {
  it("首笔出价最低为起拍价", () => {
    const min = computeMinNextBidAmount({
      highestBidAmount: null,
      startPrice: new Decimal("100"),
      bidStep: new Decimal("10"),
    });
    expect(min.toString()).toBe("100");
  });

  it("已有最高价时最低为最高价加加价步长", () => {
    const min = computeMinNextBidAmount({
      highestBidAmount: new Decimal("100"),
      startPrice: new Decimal("100"),
      bidStep: new Decimal("10"),
    });
    expect(min.toString()).toBe("110");
  });
});
