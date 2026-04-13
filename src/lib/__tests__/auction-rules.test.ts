import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBidAmount } from "@/lib/auction";

describe("computeMinNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBidAmount(
      { startPrice: new Decimal(100), bidStep: new Decimal(10) },
      null,
    );
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid when present", () => {
    const min = computeMinNextBidAmount(
      { startPrice: new Decimal(100), bidStep: new Decimal(10) },
      new Decimal(100),
    );
    expect(min.toString()).toBe("110");
  });
});
