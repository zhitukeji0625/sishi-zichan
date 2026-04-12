import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeNextMinimumBid } from "@/lib/auction";

describe("computeNextMinimumBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeNextMinimumBid({
      highestBidAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("requires previous high plus bid step", () => {
    const min = computeNextMinimumBid({
      highestBidAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });
});
