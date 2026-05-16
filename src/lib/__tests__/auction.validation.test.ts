import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinimumNextBid } from "@/lib/auction";

describe("computeMinimumNextBid", () => {
  it("首拍：无历史最高价时为起拍价", () => {
    const min = computeMinimumNextBid({
      highestAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("有最高价时为当前最高 + 加价幅度", () => {
    const min = computeMinimumNextBid({
      highestAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });

  it("小数起拍与步长", () => {
    const min = computeMinimumNextBid({
      highestAmount: new Decimal("99.5"),
      startPrice: new Decimal("99.5"),
      bidStep: new Decimal("0.5"),
    });
    expect(min.toString()).toBe("100");
  });
});
