import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBid } from "@/lib/auction-rules";

describe("computeMinNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBid({
      startPrice: 100,
      bidStep: 10,
      highestAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("uses highest bid plus step when bids exist", () => {
    const min = computeMinNextBid({
      startPrice: 100,
      bidStep: 10,
      highestAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });

  it("accepts string amounts", () => {
    const min = computeMinNextBid({
      startPrice: "99.5",
      bidStep: "0.5",
      highestAmount: "100",
    });
    expect(min.toString()).toBe("100.5");
  });
});
