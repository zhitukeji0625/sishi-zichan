import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction-logic";

describe("minNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    expect(
      minNextBidAmount({
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestBidAmount: null,
      }).toString(),
    ).toBe("100");
  });

  it("adds bid step to highest bid", () => {
    expect(
      minNextBidAmount({
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestBidAmount: new Decimal(100),
      }).toString(),
    ).toBe("110");
  });
});
