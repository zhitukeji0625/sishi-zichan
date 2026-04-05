import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minimumNextBidAmount } from "@/lib/auction";

describe("minimumNextBidAmount", () => {
  it("uses start price when there is no top bid", () => {
    expect(
      minimumNextBidAmount({
        topAmount: null,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }).toString(),
    ).toBe("100");
  });

  it("uses top plus bid step when a bid exists", () => {
    expect(
      minimumNextBidAmount({
        topAmount: new Decimal(100),
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      }).toString(),
    ).toBe("110");
  });
});
