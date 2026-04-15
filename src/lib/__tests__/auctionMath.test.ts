import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMinNextBidAmount } from "@/lib/auction";

describe("getMinNextBidAmount", () => {
  it("returns start price when there is no prior bid", () => {
    const min = getMinNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("returns highest bid plus step when a bid exists", () => {
    const min = getMinNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });

  it("accepts numeric and string inputs", () => {
    expect(
      getMinNextBidAmount({
        startPrice: "50",
        bidStep: 5,
        highestBidAmount: undefined,
      }).toString(),
    ).toBe("50");
    expect(
      getMinNextBidAmount({
        startPrice: 50,
        bidStep: "5",
        highestBidAmount: 55,
      }).toString(),
    ).toBe("60");
  });
});
