import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBid } from "@/lib/auction-rules";

describe("computeMinNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      topBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("requires top bid plus step when a bid exists", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      topBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});
