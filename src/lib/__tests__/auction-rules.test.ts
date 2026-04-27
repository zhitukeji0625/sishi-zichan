import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  assertBidAtLeastMin,
  getMinNextBidAmount,
} from "@/lib/auction";

describe("getMinNextBidAmount", () => {
  it("returns start price when there is no prior bid", () => {
    const min = getMinNextBidAmount({
      highestBidAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("returns highest plus step when there is a prior bid", () => {
    const min = getMinNextBidAmount({
      highestBidAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });
});

describe("assertBidAtLeastMin", () => {
  it("allows amount equal to minimum", () => {
    expect(() =>
      assertBidAtLeastMin(new Decimal(110), new Decimal(110)),
    ).not.toThrow();
  });

  it("rejects amount below minimum", () => {
    expect(() =>
      assertBidAtLeastMin(new Decimal(105), new Decimal(110)),
    ).toThrow(/出价需不低于/);
  });
});
