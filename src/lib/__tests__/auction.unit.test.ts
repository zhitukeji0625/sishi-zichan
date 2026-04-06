import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBid } from "@/lib/auction";

describe("computeMinNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBid({
      topAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("requires top plus bid step when there is a prior bid", () => {
    const min = computeMinNextBid({
      topAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });
});
