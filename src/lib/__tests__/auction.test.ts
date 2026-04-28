import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBid } from "@/lib/auction";

describe("computeMinNextBid", () => {
  it("first bid must be at least start price", () => {
    const min = computeMinNextBid({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("after a bid, minimum is highest plus bid step", () => {
    const min = computeMinNextBid({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });

  it("rejects amounts below minimum increment (via min used by placeBid)", () => {
    const min = computeMinNextBid({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: new Decimal(100),
    });
    expect(new Decimal(105).lessThan(min)).toBe(true);
    expect(new Decimal(110).lessThan(min)).toBe(false);
  });
});
