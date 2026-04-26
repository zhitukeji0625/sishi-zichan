import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("returns start price when there is no prior bid", () => {
    expect(
      minNextBidAmount({
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestBidAmount: null,
      }).toString(),
    ).toBe("100");
  });

  it("returns start plus step when highest bid equals start", () => {
    expect(
      minNextBidAmount({
        startPrice: "100",
        bidStep: "10",
        highestBidAmount: new Decimal(100),
      }).toString(),
    ).toBe("110");
  });

  it("accepts string inputs", () => {
    expect(
      minNextBidAmount({
        startPrice: "50.5",
        bidStep: "0.25",
        highestBidAmount: "60",
      }).toString(),
    ).toBe("60.25");
  });
});
