import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("uses start price when there is no highest bid", () => {
    const min = minNextBidAmount({
      highestAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest amount", () => {
    const min = minNextBidAmount({
      highestAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });

  it("handles decimal start price and step", () => {
    const min = minNextBidAmount({
      highestAmount: new Decimal("99.5"),
      startPrice: new Decimal(1),
      bidStep: new Decimal("0.5"),
    });
    expect(min.toString()).toBe("100");
  });
});
