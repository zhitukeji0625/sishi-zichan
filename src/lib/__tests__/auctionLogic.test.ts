import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMinNextBidAmount } from "@/lib/auctionLogic";

describe("getMinNextBidAmount", () => {
  it("returns start price when there is no highest bid", () => {
    const min = getMinNextBidAmount({
      highestBidAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("returns highest plus step when a bid exists", () => {
    const min = getMinNextBidAmount({
      highestBidAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });
});
