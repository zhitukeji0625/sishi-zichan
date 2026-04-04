import { describe, it, expect } from "vitest";
import { computeMinNextBid } from "@/lib/auction";

describe("computeMinNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBid({
      highestBidAmount: null,
      startPrice: "100",
      bidStep: "10",
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid when one exists", () => {
    const min = computeMinNextBid({
      highestBidAmount: "100",
      startPrice: "100",
      bidStep: "10",
    });
    expect(min.toString()).toBe("110");
  });
});
