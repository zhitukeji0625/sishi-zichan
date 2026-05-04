import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinimumNextBid } from "@/lib/auction";

describe("computeMinimumNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinimumNextBid({
      highestBidAmount: null,
      startPrice: "100",
      bidStep: "10",
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid when present", () => {
    const min = computeMinimumNextBid({
      highestBidAmount: "100",
      startPrice: "100",
      bidStep: "10",
    });
    expect(min.toString()).toBe("110");
  });
});
