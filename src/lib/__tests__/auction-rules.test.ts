import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBid } from "@/lib/auction-rules";

describe("computeMinNextBid", () => {
  it("returns start price when there is no prior bid", () => {
    expect(
      computeMinNextBid({
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestBidAmount: null,
      }).toString(),
    ).toBe("100");
  });

  it("returns highest plus step when a bid exists", () => {
    expect(
      computeMinNextBid({
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestBidAmount: new Decimal(100),
      }).toString(),
    ).toBe("110");
  });
});
