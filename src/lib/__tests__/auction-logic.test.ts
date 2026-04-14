import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = minNextBidAmount({
      highestAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("requires highest bid plus step when there is a prior bid", () => {
    const min = minNextBidAmount({
      highestAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });

  it("treats amounts below min next as invalid (same rule as placeBid)", () => {
    const min = minNextBidAmount({
      highestAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(new Decimal(105).lessThan(min)).toBe(true);
    expect(new Decimal(110).lessThan(min)).toBe(false);
  });
});
