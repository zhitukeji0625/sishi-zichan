import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minimumNextBidAmount } from "@/lib/auction";

describe("minimumNextBidAmount", () => {
  const startPrice = new Decimal(100);
  const bidStep = new Decimal(10);

  it("requires first bid at least the start price", () => {
    const min = minimumNextBidAmount({
      startPrice,
      bidStep,
      topAmount: null,
    });
    expect(min.toString()).toBe("100");
    expect(new Decimal(100).lessThan(min)).toBe(false);
  });

  it("requires subsequent bids to clear prior high plus step", () => {
    const min = minimumNextBidAmount({
      startPrice,
      bidStep,
      topAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
    expect(new Decimal(105).lessThan(min)).toBe(true);
  });
});
