import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minRequiredBidAmount } from "@/lib/auction";

describe("minRequiredBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = minRequiredBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("requires top bid plus step after a bid exists", () => {
    const min = minRequiredBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });

  it("treats 105 as below minimum after 100 is leading", () => {
    const min = minRequiredBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(new Decimal(105).lessThan(min)).toBe(true);
  });
});
