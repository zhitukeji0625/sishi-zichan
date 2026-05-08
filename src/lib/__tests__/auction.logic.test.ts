import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("首笔出价下限为起拍价", () => {
    const v = minNextBidAmount({
      highestBidAmount: null,
      startPrice: new Decimal("100"),
      bidStep: new Decimal("10"),
    });
    expect(v.toString()).toBe("100");
  });

  it("有最高价时为最高价加价幅度", () => {
    const v = minNextBidAmount({
      highestBidAmount: new Decimal("100"),
      startPrice: new Decimal("100"),
      bidStep: new Decimal("10"),
    });
    expect(v.toString()).toBe("110");
  });
});
