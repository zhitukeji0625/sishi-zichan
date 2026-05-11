import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMinimumNextBid } from "@/lib/auction";

describe("computeMinimumNextBid", () => {
  const project = {
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("first bid must be at least start price", () => {
    const min = computeMinimumNextBid(project, null);
    expect(min.toString()).toBe("100");
  });

  it("after a bid, minimum is highest plus step", () => {
    const min = computeMinimumNextBid(project, new Decimal(100));
    expect(min.toString()).toBe("110");
  });

  it("handles decimal step", () => {
    const p = {
      startPrice: new Decimal("99.5"),
      bidStep: new Decimal("0.5"),
    };
    expect(computeMinimumNextBid(p, null).toString()).toBe("99.5");
    expect(computeMinimumNextBid(p, new Decimal("99.5")).toString()).toBe("100");
  });
});
