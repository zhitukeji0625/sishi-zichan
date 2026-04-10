import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinimumNextBid } from "@/lib/auction";

describe("computeMinimumNextBid", () => {
  it("returns start price when there is no prior bid", () => {
    const min = computeMinimumNextBid({
      startPrice: "100",
      bidStep: "10",
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("returns highest bid plus step when there is a prior bid", () => {
    const min = computeMinimumNextBid({
      startPrice: "100",
      bidStep: "10",
      highestBidAmount: "100",
    });
    expect(min.toString()).toBe("110");
  });

  it("matches Decimal comparison used by placeBid", () => {
    const min = computeMinimumNextBid({
      startPrice: "100",
      bidStep: "10",
      highestBidAmount: "100",
    });
    expect(new Decimal("105").lessThan(min)).toBe(true);
    expect(new Decimal("110").lessThan(min)).toBe(false);
  });
});
