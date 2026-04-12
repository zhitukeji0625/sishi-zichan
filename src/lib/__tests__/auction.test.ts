import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMinRequiredBid } from "@/lib/auction";

describe("getMinRequiredBid", () => {
  it("requires first bid at start price", () => {
    const min = getMinRequiredBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("requires increment above highest bid", () => {
    const min = getMinRequiredBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });

  it("matches placeBid: 105 is invalid after bid at 100 with step 10", () => {
    const min = getMinRequiredBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(new Decimal(105).lessThan(min)).toBe(true);
  });
});
