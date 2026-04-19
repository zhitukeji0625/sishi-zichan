import { describe, it, expect } from "vitest";
import { computeMinNextBid } from "@/lib/auction";

describe("computeMinNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    expect(
      computeMinNextBid({
        startPrice: "100",
        bidStep: "10",
        highestBidAmount: null,
      }).toString(),
    ).toBe("100");
  });

  it("adds bid step to the highest bid", () => {
    expect(
      computeMinNextBid({
        startPrice: "100",
        bidStep: "10",
        highestBidAmount: "100",
      }).toString(),
    ).toBe("110");
  });
});
