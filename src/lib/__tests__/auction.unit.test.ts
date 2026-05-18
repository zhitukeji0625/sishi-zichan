import { describe, it, expect } from "vitest";
import { computeMinNextBidAmount } from "@/lib/auction";

describe("computeMinNextBidAmount", () => {
  it("uses start price when there is no highest bid", () => {
    const min = computeMinNextBidAmount({
      highestBidAmount: null,
      startPrice: "100",
      bidStep: "10",
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid", () => {
    const min = computeMinNextBidAmount({
      highestBidAmount: "100",
      startPrice: "100",
      bidStep: "10",
    });
    expect(min.toString()).toBe("110");
  });
});
