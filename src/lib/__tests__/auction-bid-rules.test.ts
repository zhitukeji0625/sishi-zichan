import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinimumNextBid } from "@/lib/auction";

describe("computeMinimumNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinimumNextBid({
      highestBidAmount: null,
      startPrice: new Decimal("100"),
      bidStep: new Decimal("10"),
    });
    expect(min.toString()).toBe("100");
  });

  it("uses start price when highest is undefined", () => {
    const min = computeMinimumNextBid({
      highestBidAmount: undefined,
      startPrice: new Decimal("50.5"),
      bidStep: new Decimal("0.5"),
    });
    expect(min.toString()).toBe("50.5");
  });

  it("adds bid step to current highest", () => {
    const min = computeMinimumNextBid({
      highestBidAmount: new Decimal("100"),
      startPrice: new Decimal("100"),
      bidStep: new Decimal("10"),
    });
    expect(min.toString()).toBe("110");
  });

  it("handles decimal increments", () => {
    const min = computeMinimumNextBid({
      highestBidAmount: new Decimal("99.99"),
      startPrice: new Decimal("10"),
      bidStep: new Decimal("0.01"),
    });
    expect(min.toString()).toBe("100");
  });
});
