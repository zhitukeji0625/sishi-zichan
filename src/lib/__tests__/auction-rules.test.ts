import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBidAmount } from "@/lib/auction-rules";

describe("computeMinNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBidAmount({
      startPrice: "100",
      bidStep: "10",
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid when one exists", () => {
    const min = computeMinNextBidAmount({
      startPrice: "100",
      bidStep: "10",
      highestBidAmount: "100",
    });
    expect(min.toString()).toBe("110");
  });

  it("matches Decimal comparison used by placeBid", () => {
    const min = computeMinNextBidAmount({
      startPrice: "100.5",
      bidStep: "0.5",
      highestBidAmount: "100.5",
    });
    expect(new Decimal("100.9").lessThan(min)).toBe(true);
    expect(new Decimal("101").lessThan(min)).toBe(false);
  });
});
