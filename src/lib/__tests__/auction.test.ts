import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  computeMinNextBid,
  assertBidMeetsMinimum,
} from "@/lib/auction";

describe("auction bid rules", () => {
  it("first bid must be at least start price", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
    expect(() =>
      assertBidMeetsMinimum(new Decimal(100), min),
    ).not.toThrow();
    expect(() => assertBidMeetsMinimum(new Decimal(99), min)).toThrow(
      "出价需不低于 100.00",
    );
  });

  it("subsequent bid must beat highest by bid step", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
    expect(() =>
      assertBidMeetsMinimum(new Decimal(110), min),
    ).not.toThrow();
    expect(() => assertBidMeetsMinimum(new Decimal(105), min)).toThrow(
      "出价需不低于 110.00",
    );
  });
});
