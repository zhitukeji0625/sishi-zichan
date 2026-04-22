import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { nextMinimumBidAmount } from "@/lib/auction-rules";

describe("nextMinimumBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = nextMinimumBidAmount(
      null,
      new Decimal(100),
      new Decimal(10),
    );
    expect(min.toString()).toBe("100");
  });

  it("uses highest bid plus step when bids exist", () => {
    const min = nextMinimumBidAmount(
      new Decimal(100),
      new Decimal(50),
      new Decimal(10),
    );
    expect(min.toString()).toBe("110");
  });
});
