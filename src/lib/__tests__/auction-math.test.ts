import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = minNextBidAmount(null, new Decimal(100), new Decimal(10));
    expect(min.toString()).toBe("100");
  });

  it("requires highest plus bid step when bids exist", () => {
    const min = minNextBidAmount(
      { amount: new Decimal(100) },
      new Decimal(100),
      new Decimal(10),
    );
    expect(min.toString()).toBe("110");
  });
});
