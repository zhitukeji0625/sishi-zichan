import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMinNextBidAmount } from "@/lib/auction";

describe("getMinNextBidAmount", () => {
  it("returns start price when there is no prior bid", () => {
    expect(
      getMinNextBidAmount({
        highestBidAmount: null,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }).toString(),
    ).toBe("100");
  });

  it("returns highest plus step when a bid exists", () => {
    expect(
      getMinNextBidAmount({
        highestBidAmount: new Decimal(100),
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }).toString(),
    ).toBe("110");
  });
});
