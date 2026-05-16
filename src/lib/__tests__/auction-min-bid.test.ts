import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBidAmount } from "@/lib/auction";

describe("computeMinNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBidAmount({
      startPrice: "100",
      bidStep: "10",
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid", () => {
    const min = computeMinNextBidAmount({
      startPrice: "100",
      bidStep: "10",
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });

  it("handles decimal start and step", () => {
    const min = computeMinNextBidAmount({
      startPrice: "99.5",
      bidStep: "0.5",
      highestBidAmount: new Decimal("100.25"),
    });
    expect(min.toString()).toBe("100.75");
  });
});
