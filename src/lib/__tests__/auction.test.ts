import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  minNextBidAmount,
  assertBidMeetsMinimum,
} from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("first bid must be at least start price", () => {
    const min = minNextBidAmount({
      highestBidAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("subsequent bid must be highest + bid step", () => {
    const min = minNextBidAmount({
      highestBidAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });
});

describe("assertBidMeetsMinimum", () => {
  it("accepts amount equal to minimum", () => {
    expect(() =>
      assertBidMeetsMinimum(new Decimal(100), new Decimal(100)),
    ).not.toThrow();
  });

  it("rejects amount below minimum", () => {
    expect(() =>
      assertBidMeetsMinimum(new Decimal(105), new Decimal(110)),
    ).toThrow(/出价需不低于/);
  });
});
