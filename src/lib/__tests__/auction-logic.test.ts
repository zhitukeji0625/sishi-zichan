import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  assertBidMeetsMinimum,
  computeMinNextBid,
} from "@/lib/auction-logic";

describe("computeMinNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBid({
      highestBidAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step on top of highest bid", () => {
    const min = computeMinNextBid({
      highestBidAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });
});

describe("assertBidMeetsMinimum", () => {
  it("allows amount equal to minimum", () => {
    expect(() =>
      assertBidMeetsMinimum(new Decimal(110), new Decimal(110)),
    ).not.toThrow();
  });

  it("rejects amount below minimum", () => {
    expect(() =>
      assertBidMeetsMinimum(new Decimal(105), new Decimal(110)),
    ).toThrow(/出价需不低于/);
  });
});
