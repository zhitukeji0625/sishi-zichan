import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBid } from "@/lib/auction";

describe("computeMinNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBid({
      highestAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("requires current high plus bid step when a bid exists", () => {
    const min = computeMinNextBid({
      highestAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });

  it("accepts numeric and string inputs for prices", () => {
    expect(
      computeMinNextBid({
        highestAmount: null,
        startPrice: 50,
        bidStep: 5,
      }).toString(),
    ).toBe("50");
    expect(
      computeMinNextBid({
        highestAmount: new Decimal("99.5"),
        startPrice: "50",
        bidStep: "0.5",
      }).toString(),
    ).toBe("100");
  });
});
