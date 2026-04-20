import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBid } from "@/lib/auction-bid-rules";

describe("computeMinNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBid({
      topBidAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("requires highest bid plus step when a bid exists", () => {
    const min = computeMinNextBid({
      topBidAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });

  it("accepts string amounts from serialized values", () => {
    const min = computeMinNextBid({
      topBidAmount: "50.5",
      startPrice: "100",
      bidStep: "0.25",
    });
    expect(min.toString()).toBe("50.75");
  });
});
