import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBidAmount } from "@/lib/auction";

describe("computeMinNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBidAmount({
      highestBidAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("requires top bid plus bid step after a bid exists", () => {
    const min = computeMinNextBidAmount({
      highestBidAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });

  it("treats amount between top and top+step as below minimum (regression for 105 vs 110)", () => {
    const min = computeMinNextBidAmount({
      highestBidAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(new Decimal(105).lessThan(min)).toBe(true);
    expect(new Decimal(110).lessThan(min)).toBe(false);
  });
});
