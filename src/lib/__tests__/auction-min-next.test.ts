import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("首口为起拍价", () => {
    const m = minNextBidAmount({
      topAmount: null,
      bidStep: new Decimal(10),
      startPrice: new Decimal(100),
    });
    expect(m.toString()).toBe("100");
  });

  it("有历史时为首价+步长", () => {
    const m = minNextBidAmount({
      topAmount: new Decimal(100),
      bidStep: new Decimal(10),
      startPrice: new Decimal(100),
    });
    expect(m.toString()).toBe("110");
  });
});
