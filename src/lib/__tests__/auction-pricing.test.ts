import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMinimumNextBid } from "@/lib/auction";

describe("getMinimumNextBid", () => {
  it("first bid must be at least start price", () => {
    expect(
      getMinimumNextBid({
        highestBidAmount: null,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }).toString(),
    ).toBe("100");
  });

  it("next bid must be highest plus step", () => {
    expect(
      getMinimumNextBid({
        highestBidAmount: new Decimal(100),
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }).toString(),
    ).toBe("110");
  });
});
