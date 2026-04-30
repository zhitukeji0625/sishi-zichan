import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("first bid floor is start price", () => {
    const min = minNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("after a bid, floor is highest plus step", () => {
    const min = minNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});
