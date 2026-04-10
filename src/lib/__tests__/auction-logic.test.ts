import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMinimumNextBidAmount, validateBidAmount } from "@/lib/auction-logic";

describe("getMinimumNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = getMinimumNextBidAmount({
      startPrice: "100",
      bidStep: "10",
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid when present", () => {
    const min = getMinimumNextBidAmount({
      startPrice: "100",
      bidStep: "10",
      highestBidAmount: "100",
    });
    expect(min.toString()).toBe("110");
  });
});

describe("validateBidAmount", () => {
  it("accepts amount equal to minimum", () => {
    expect(() =>
      validateBidAmount(new Decimal("110"), new Decimal("110")),
    ).not.toThrow();
  });

  it("rejects amount below minimum", () => {
    expect(() =>
      validateBidAmount(new Decimal("105"), new Decimal("110")),
    ).toThrow(/出价需不低于/);
  });
});
