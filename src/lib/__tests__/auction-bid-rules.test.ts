import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { assertBidMeetsMinimum, minNextBidAmount } from "@/lib/auction-bid-rules";

describe("minNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    expect(
      minNextBidAmount({
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestBidAmount: null,
      }).toString(),
    ).toBe("100");
  });

  it("adds bid step to highest bid", () => {
    expect(
      minNextBidAmount({
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestBidAmount: new Decimal(150),
      }).toString(),
    ).toBe("160");
  });
});

describe("assertBidMeetsMinimum", () => {
  it("allows amount equal to minimum", () => {
    expect(() =>
      assertBidMeetsMinimum({
        amount: new Decimal(100),
        minNext: new Decimal(100),
      }),
    ).not.toThrow();
  });

  it("rejects amount below minimum", () => {
    expect(() =>
      assertBidMeetsMinimum({
        amount: new Decimal(105),
        minNext: new Decimal(110),
      }),
    ).toThrow(/出价需不低于/);
  });
});
