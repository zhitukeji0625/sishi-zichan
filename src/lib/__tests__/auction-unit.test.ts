import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    expect(
      minNextBidAmount({
        highestBidAmount: null,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }).toString(),
    ).toBe("100");
  });

  it("adds bid step to highest bid", () => {
    expect(
      minNextBidAmount({
        highestBidAmount: new Decimal(100),
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }).toString(),
    ).toBe("110");
  });
});
