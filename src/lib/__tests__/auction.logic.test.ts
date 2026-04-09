import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMinimumNextBid } from "@/lib/auction";

describe("getMinimumNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = getMinimumNextBid({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("requires start price for first valid bid amount", () => {
    const min = getMinimumNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(new Decimal(100).greaterThanOrEqualTo(min)).toBe(true);
    expect(new Decimal(99).lessThan(min)).toBe(true);
  });

  it("adds bid step to highest bid for subsequent bids", () => {
    const min = getMinimumNextBid({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
    expect(new Decimal(105).lessThan(min)).toBe(true);
    expect(new Decimal(110).greaterThanOrEqualTo(min)).toBe(true);
  });
});
