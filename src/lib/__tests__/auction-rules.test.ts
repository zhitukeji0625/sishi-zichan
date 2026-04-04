import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { nextMinimumBidAmount } from "@/lib/auction";

describe("nextMinimumBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    expect(
      nextMinimumBidAmount(null, new Decimal(100), new Decimal(10)).toString(),
    ).toBe("100");
  });

  it("requires previous high plus bid step", () => {
    expect(
      nextMinimumBidAmount(
        new Decimal(100),
        new Decimal(50),
        new Decimal(10),
      ).toString(),
    ).toBe("110");
  });
});
