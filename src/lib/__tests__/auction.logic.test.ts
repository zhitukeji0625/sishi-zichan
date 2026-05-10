import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("returns start price when there is no prior bid", () => {
    expect(
      minNextBidAmount(new Decimal(100), new Decimal(10), null).toString(),
    ).toBe("100");
    expect(
      minNextBidAmount(new Decimal(100), new Decimal(10), undefined).toString(),
    ).toBe("100");
  });

  it("returns highest plus step when a bid exists", () => {
    expect(
      minNextBidAmount(new Decimal(100), new Decimal(10), new Decimal(100)).toString(),
    ).toBe("110");
  });
});
