import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getMinNextBidAmount,
  assertBidMeetsMinimum,
} from "@/lib/auction";

describe("getMinNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = getMinNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("uses highest bid plus step when there is a prior bid", () => {
    const min = getMinNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});

describe("assertBidMeetsMinimum", () => {
  it("accepts first bid at start price", () => {
    const minNext = getMinNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(() =>
      assertBidMeetsMinimum(new Decimal(100), minNext),
    ).not.toThrow();
  });

  it("rejects bid below min increment after a bid at start price", () => {
    const minNext = getMinNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(() =>
      assertBidMeetsMinimum(new Decimal(105), minNext),
    ).toThrow(/出价需不低于/);
  });
});
