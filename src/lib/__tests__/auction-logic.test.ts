import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMinNextBidAmount } from "@/lib/auction";

describe("getMinNextBidAmount", () => {
  const project = {
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("uses start price when there is no prior bid", () => {
    expect(getMinNextBidAmount(project, null).toString()).toBe("100");
  });

  it("requires highest bid plus step when bids exist", () => {
    const top = { amount: new Decimal(100) };
    expect(getMinNextBidAmount(project, top).toString()).toBe("110");
  });
});
