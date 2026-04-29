import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  computeMinNextBid,
  assertBidAmountAtLeastMin,
} from "@/lib/auction";

describe("computeMinNextBid", () => {
  const startPrice = new Decimal(100);
  const bidStep = new Decimal(10);

  it("first bid floor is start price when there is no prior bid", () => {
    const min = computeMinNextBid({
      startPrice,
      bidStep,
      highestAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("next bid floor is highest plus step", () => {
    const min = computeMinNextBid({
      startPrice,
      bidStep,
      highestAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});

describe("assertBidAmountAtLeastMin", () => {
  it("accepts amount equal to minimum", () => {
    expect(() =>
      assertBidAmountAtLeastMin(new Decimal(100), new Decimal(100)),
    ).not.toThrow();
  });

  it("rejects amount below minimum", () => {
    expect(() =>
      assertBidAmountAtLeastMin(new Decimal(105), new Decimal(110)),
    ).toThrow(/出价需不低于/);
  });
});
