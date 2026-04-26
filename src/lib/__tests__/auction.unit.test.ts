import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBidAmount } from "@/lib/auction";

describe("computeMinNextBidAmount", () => {
  const project = {
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("uses start price when there is no prior bid", () => {
    expect(computeMinNextBidAmount(project, null).toString()).toBe("100");
  });

  it("adds bid step to highest bid", () => {
    expect(computeMinNextBidAmount(project, new Decimal(100)).toString()).toBe("110");
  });
});
