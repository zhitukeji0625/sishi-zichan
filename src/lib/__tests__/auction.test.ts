import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { assertBidMeetsMinimum, minNextBidAmount } from "@/lib/auction-bid-rules";

describe("minNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = minNextBidAmount({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid when one exists", () => {
    const min = minNextBidAmount({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});

describe("assertBidMeetsMinimum", () => {
  it("allows bid equal to minimum", () => {
    expect(() =>
      assertBidMeetsMinimum(new Decimal(100), new Decimal(100)),
    ).not.toThrow();
  });

  it("rejects bid below minimum increment", () => {
    expect(() =>
      assertBidMeetsMinimum(new Decimal(105), new Decimal(110)),
    ).toThrow(/出价需不低于/);
  });
});
