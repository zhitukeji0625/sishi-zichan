import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  assertBidAtLeastMinimum,
  computeMinimumNextBid,
} from "@/lib/auction-bid-rules";

describe("computeMinimumNextBid", () => {
  it("first bid must be at least start price", () => {
    const min = computeMinimumNextBid({
      highestBidAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("after a bid, minimum is highest plus step", () => {
    const min = computeMinimumNextBid({
      highestBidAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });
});

describe("assertBidAtLeastMinimum", () => {
  it("accepts amount equal to minimum", () => {
    expect(() =>
      assertBidAtLeastMinimum(new Decimal(100), new Decimal(100)),
    ).not.toThrow();
  });

  it("rejects amount below minimum", () => {
    expect(() =>
      assertBidAtLeastMinimum(new Decimal(105), new Decimal(110)),
    ).toThrow(/出价需不低于/);
  });
});
