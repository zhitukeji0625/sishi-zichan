import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount, validateBidAgainstMinimum } from "@/lib/auction-rules";

describe("minNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    expect(
      minNextBidAmount({
        highestBidAmount: null,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }).toString(),
    ).toBe("100");
  });

  it("adds bid step to highest bid when present", () => {
    expect(
      minNextBidAmount({
        highestBidAmount: new Decimal(100),
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }).toString(),
    ).toBe("110");
  });
});

describe("validateBidAgainstMinimum", () => {
  it("accepts first bid at start price", () => {
    expect(() =>
      validateBidAgainstMinimum({
        amount: new Decimal(100),
        highestBidAmount: null,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }),
    ).not.toThrow();
  });

  it("rejects bid below min increment after a bid exists", () => {
    expect(() =>
      validateBidAgainstMinimum({
        amount: new Decimal(105),
        highestBidAmount: new Decimal(100),
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }),
    ).toThrow(/出价需不低于/);
  });
});
