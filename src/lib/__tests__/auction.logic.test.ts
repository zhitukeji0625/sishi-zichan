import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinNextBid } from "@/lib/auction";

describe("computeMinNextBid", () => {
  const project = {
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("uses start price when there is no prior bid", () => {
    expect(computeMinNextBid(null, project).toString()).toBe("100");
  });

  it("requires top bid plus step when there is a prior bid", () => {
    const top = { amount: new Decimal(100) };
    expect(computeMinNextBid(top, project).toString()).toBe("110");
  });
});
