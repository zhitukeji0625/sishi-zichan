import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("first bid must be at least start price", () => {
    const min = minNextBidAmount(new Decimal(100), new Decimal(10), null);
    expect(min.toString()).toBe("100");
  });

  it("subsequent bid must be highest plus step", () => {
    const min = minNextBidAmount(
      new Decimal(100),
      new Decimal(10),
      new Decimal(100),
    );
    expect(min.toString()).toBe("110");
  });
});
