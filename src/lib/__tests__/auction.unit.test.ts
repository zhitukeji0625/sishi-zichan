import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBidAmount } from "@/lib/auction";

describe("computeMinNextBidAmount", () => {
  it("uses start price when there is no top bid", () => {
    const min = computeMinNextBidAmount({
      topAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to top amount when a bid exists", () => {
    const min = computeMinNextBidAmount({
      topAmount: new Decimal(100),
      startPrice: new Decimal(50),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });
});
