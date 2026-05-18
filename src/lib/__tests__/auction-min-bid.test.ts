import { describe, it, expect } from "vitest";
import { minimumNextBidAmount } from "@/lib/auction";

describe("minimumNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = minimumNextBidAmount({
      highestBidAmount: null,
      startPrice: "100",
      bidStep: "10",
    });
    expect(min.toString()).toBe("100");
  });

  it("requires highest bid plus step when bids exist", () => {
    const min = minimumNextBidAmount({
      highestBidAmount: "100",
      startPrice: "100",
      bidStep: "10",
    });
    expect(min.toString()).toBe("110");
  });
});
