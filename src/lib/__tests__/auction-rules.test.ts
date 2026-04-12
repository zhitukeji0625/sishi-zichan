import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBidAmount } from "@/lib/auction";

describe("computeMinNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBidAmount(
      null,
      new Decimal(100),
      new Decimal(10),
    );
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid when present", () => {
    const min = computeMinNextBidAmount(
      new Decimal(100),
      new Decimal(50),
      new Decimal(10),
    );
    expect(min.toString()).toBe("110");
  });
});
