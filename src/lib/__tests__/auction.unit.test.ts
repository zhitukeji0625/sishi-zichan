import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  const project = {
    startPrice: { toString: () => "100" },
    bidStep: { toString: () => "10" },
  };

  it("uses start price when there is no prior bid", () => {
    expect(minNextBidAmount(project, null).toString()).toBe("100");
  });

  it("adds bid step to the current top amount", () => {
    expect(
      minNextBidAmount(project, new Decimal(100)).toString(),
    ).toBe("110");
  });
});
