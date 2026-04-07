import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = minNextBidAmount({
      highestAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid", () => {
    const min = minNextBidAmount({
      highestAmount: "100",
      startPrice: new Decimal(1),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });
});
