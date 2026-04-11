import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getMinimumNextBidAmount,
  validateBidAmountAgainstProject,
} from "@/lib/auction";

describe("auction bid rules", () => {
  it("first bid must be at least start price", () => {
    const min = getMinimumNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
    expect(() =>
      validateBidAmountAgainstProject({
        amount: new Decimal(99),
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestBidAmount: null,
      }),
    ).toThrow(/出价需不低于/);
    expect(() =>
      validateBidAmountAgainstProject({
        amount: new Decimal(100),
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestBidAmount: null,
      }),
    ).not.toThrow();
  });

  it("subsequent bid must beat highest by bid step", () => {
    const min = getMinimumNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
    expect(() =>
      validateBidAmountAgainstProject({
        amount: new Decimal(105),
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestBidAmount: new Decimal(100),
      }),
    ).toThrow(/出价需不低于/);
    expect(() =>
      validateBidAmountAgainstProject({
        amount: new Decimal(110),
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestBidAmount: new Decimal(100),
      }),
    ).not.toThrow();
  });
});
