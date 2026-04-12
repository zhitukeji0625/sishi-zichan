import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  const project = {
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("uses start price when there is no prior bid", () => {
    expect(minNextBidAmount(project, null).toString()).toBe("100");
  });

  it("adds bid step to the current highest bid", () => {
    const top = { amount: new Decimal(100) };
    expect(minNextBidAmount(project, top).toString()).toBe("110");
  });
});
