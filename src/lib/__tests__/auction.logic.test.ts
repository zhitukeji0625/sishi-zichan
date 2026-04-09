import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBid } from "@/lib/auction";

describe("computeMinNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("requires highest bid plus step when bids exist", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});
