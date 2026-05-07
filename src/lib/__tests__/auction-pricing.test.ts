import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("equals start price when there is no prior bid", () => {
    const min = minNextBidAmount({
      highestAmount: null,
      startPrice: new Decimal("100"),
      bidStep: new Decimal("10"),
    });
    expect(min.toString()).toBe("100");
  });

  it("equals highest plus bid step when bids exist", () => {
    const min = minNextBidAmount({
      highestAmount: new Decimal("100"),
      startPrice: new Decimal("100"),
      bidStep: new Decimal("10"),
    });
    expect(min.toString()).toBe("110");
  });

  it("handles decimal step", () => {
    const min = minNextBidAmount({
      highestAmount: new Decimal("99.5"),
      startPrice: new Decimal("50"),
      bidStep: new Decimal("0.5"),
    });
    expect(min.toString()).toBe("100");
  });
});
