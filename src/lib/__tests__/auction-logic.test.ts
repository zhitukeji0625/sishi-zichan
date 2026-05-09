import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minimumNextBidAmount } from "@/lib/auction";

describe("minimumNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = minimumNextBidAmount({
      highestBidAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid when one exists", () => {
    const min = minimumNextBidAmount({
      highestBidAmount: new Decimal(100),
      startPrice: new Decimal(50),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });
});
