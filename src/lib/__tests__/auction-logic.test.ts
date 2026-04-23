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

  it("next bid must be current high plus bid step", () => {
    const min = computeMinimumNextBid(project, {
      amount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});
