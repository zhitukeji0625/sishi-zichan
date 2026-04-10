import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinimumBidAmount } from "@/lib/auction";

describe("computeMinimumBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinimumBidAmount(
      null,
      new Decimal(100),
      new Decimal(10),
    );
    expect(min.toString()).toBe("100");
  });

  it("uses highest bid plus step when a bid exists", () => {
    const min = computeMinimumBidAmount(
      { amount: new Decimal(100) },
      new Decimal(100),
      new Decimal(10),
    );
    expect(min.toString()).toBe("110");
  });

  it("matches placeBid rule: first valid amount equals start price", () => {
    const min = computeMinimumBidAmount(
      null,
      new Decimal(100),
      new Decimal(10),
    );
    expect(new Decimal(100).greaterThanOrEqualTo(min)).toBe(true);
  });

  it("matches placeBid rule: amount below min increment is invalid", () => {
    const min = computeMinimumBidAmount(
      { amount: new Decimal(100) },
      new Decimal(100),
      new Decimal(10),
    );
    expect(new Decimal(105).lessThan(min)).toBe(true);
  });
});
