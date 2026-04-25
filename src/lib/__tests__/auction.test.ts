import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minimumNextBidAmount } from "@/lib/auction";

describe("minimumNextBidAmount", () => {
  it("equals start price when there is no prior bid", () => {
    const min = minimumNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("equals highest bid plus step when a bid exists", () => {
    const min = minimumNextBidAmount({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});

describe("placeBid amount rules (via minimumNextBidAmount)", () => {
  const startPrice = new Decimal(100);
  const bidStep = new Decimal(10);

  it("accepts first bid at start price", () => {
    const minNext = minimumNextBidAmount({
      startPrice,
      bidStep,
      highestBidAmount: null,
    });
    const amount = new Decimal(100);
    expect(amount.greaterThanOrEqualTo(minNext)).toBe(true);
  });

  it("rejects bid below min increment after a bid at start", () => {
    const minNext = minimumNextBidAmount({
      startPrice,
      bidStep,
      highestBidAmount: new Decimal(100),
    });
    const amount = new Decimal(105);
    expect(amount.lessThan(minNext)).toBe(true);
  });
});
