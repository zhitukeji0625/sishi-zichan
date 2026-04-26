import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount, assertBidAtLeastMin } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("returns start price when there is no highest bid", () => {
    const min = minNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("returns highest plus step when there is a highest bid", () => {
    const min = minNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});

describe("assertBidAtLeastMin", () => {
  it("does not throw when amount equals minimum", () => {
    expect(() =>
      assertBidAtLeastMin(new Decimal(100), new Decimal(100)),
    ).not.toThrow();
  });

  it("throws when amount is below minimum", () => {
    expect(() =>
      assertBidAtLeastMin(new Decimal(105), new Decimal(110)),
    ).toThrow(/出价需不低于/);
  });
});
