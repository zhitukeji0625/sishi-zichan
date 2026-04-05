import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBid, validateBidAmount } from "@/lib/auction-rules";

describe("computeMinNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});

describe("validateBidAmount", () => {
  it("accepts amount equal to minimum", () => {
    expect(() =>
      validateBidAmount(new Decimal(100), new Decimal(100)),
    ).not.toThrow();
  });

  it("rejects amount below minimum", () => {
    expect(() =>
      validateBidAmount(new Decimal(105), new Decimal(110)),
    ).toThrow(/出价需不低于/);
  });
});
