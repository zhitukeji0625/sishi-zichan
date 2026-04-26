import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction-bid-rules";

describe("minNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = minNextBidAmount({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("uses start price when highest is undefined", () => {
    const min = minNextBidAmount({
      startPrice: new Decimal("99.5"),
      bidStep: new Decimal("0.5"),
    });
    expect(min.toString()).toBe("99.5");
  });

  it("adds bid step to current highest", () => {
    const min = minNextBidAmount({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });

  it("matches placeBid rule: first bid at start then next at start+step", () => {
    const first = minNextBidAmount({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: null,
    });
    expect(first.lessThan(new Decimal(100))).toBe(false);
    expect(first.equals(new Decimal(100))).toBe(true);

    const second = minNextBidAmount({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: 100,
    });
    expect(second.toString()).toBe("110");
    expect(new Decimal(105).lessThan(second)).toBe(true);
  });
});
