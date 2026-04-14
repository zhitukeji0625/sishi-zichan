import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("first bid must be at least start price", () => {
    const min = minNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      topAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("subsequent bid must be at least top + step", () => {
    const min = minNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      topAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});
