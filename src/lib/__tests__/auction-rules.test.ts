import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minimumNextBidAmount } from "@/lib/auction-rules";

describe("minimumNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = minimumNextBidAmount({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("requires highest bid plus step when a bid exists", () => {
    const min = minimumNextBidAmount({
      startPrice: 100,
      bidStep: 10,
      highestBidAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});
