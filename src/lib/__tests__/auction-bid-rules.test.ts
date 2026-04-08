import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minRequiredBid } from "@/lib/auction-bid-rules";

describe("minRequiredBid", () => {
  const project = {
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("returns start price when there is no top bid", () => {
    expect(minRequiredBid(project, null).toString()).toBe("100");
  });

  it("returns top amount plus bid step when there is a top bid", () => {
    const top = { amount: new Decimal(100) };
    expect(minRequiredBid(project, top).toString()).toBe("110");
  });
});
