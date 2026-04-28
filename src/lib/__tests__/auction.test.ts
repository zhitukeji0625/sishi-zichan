import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMinNextBidAmount } from "@/lib/auction";

describe("getMinNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = getMinNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("requires current high plus bid step after a bid exists", () => {
    const min = getMinNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });

  it("matches first-bid and increment rules used by placeBid", () => {
    const start = new Decimal(100);
    const step = new Decimal(10);
    const firstMin = getMinNextBidAmount({
      startPrice: start,
      bidStep: step,
      highestBidAmount: null,
    });
    expect(new Decimal(100).greaterThanOrEqualTo(firstMin)).toBe(true);
    const afterFirst = getMinNextBidAmount({
      startPrice: start,
      bidStep: step,
      highestBidAmount: new Decimal(100),
    });
    expect(new Decimal(105).lessThan(afterFirst)).toBe(true);
    expect(new Decimal(110).greaterThanOrEqualTo(afterFirst)).toBe(true);
  });
});
