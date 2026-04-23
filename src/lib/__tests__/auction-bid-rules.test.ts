import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  assertBidMeetsMinimum,
  minNextBidAmount,
} from "@/lib/auction-bid-rules";

describe("minNextBidAmount", () => {
  it("returns start price when there is no highest bid", () => {
    expect(
      minNextBidAmount(new Decimal(100), new Decimal(10), null).toString(),
    ).toBe("100");
  });

  it("returns highest plus step when a bid exists", () => {
    expect(
      minNextBidAmount(new Decimal(100), new Decimal(10), new Decimal(100)).toString(),
    ).toBe("110");
  });
});

describe("assertBidMeetsMinimum", () => {
  it("allows amount equal to minimum", () => {
    expect(() =>
      assertBidMeetsMinimum(new Decimal(100), new Decimal(100)),
    ).not.toThrow();
  });

  it("rejects amount below minimum", () => {
    expect(() =>
      assertBidMeetsMinimum(new Decimal(105), new Decimal(110)),
    ).toThrow(/出价需不低于/);
  });
});
