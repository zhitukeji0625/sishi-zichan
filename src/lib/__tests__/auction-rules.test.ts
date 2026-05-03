import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minimumNextBidAmount } from "@/lib/auction";

describe("minimumNextBidAmount", () => {
  it("first bid must be at least start price", () => {
    const min = minimumNextBidAmount({
      highestAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("subsequent bid must be highest plus step", () => {
    const min = minimumNextBidAmount({
      highestAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });
});
