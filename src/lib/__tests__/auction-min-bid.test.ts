import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBid } from "@/lib/auction";

describe("computeMinNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    expect(
      computeMinNextBid({
        highestBidAmount: null,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }).toString(),
    ).toBe("100");
  });

  it("adds bid step to the highest bid amount", () => {
    expect(
      computeMinNextBid({
        highestBidAmount: new Decimal(100),
        startPrice: new Decimal(50),
        bidStep: new Decimal(10),
      }).toString(),
    ).toBe("110");
  });
});
