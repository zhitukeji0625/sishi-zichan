import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { assertBidAtLeastMin, minNextBidAmount } from "@/lib/auction-rules";

describe("minNextBidAmount", () => {
  const project = {
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("first bid floor is start price", () => {
    expect(minNextBidAmount(project, null).toString()).toBe("100");
  });

  it("after a bid, floor is top plus step", () => {
    expect(minNextBidAmount(project, new Decimal(100)).toString()).toBe("110");
  });
});

describe("assertBidAtLeastMin", () => {
  it("allows amount equal to minimum", () => {
    expect(() =>
      assertBidAtLeastMin(new Decimal(100), new Decimal(100)),
    ).not.toThrow();
  });

  it("rejects amount below minimum", () => {
    expect(() =>
      assertBidAtLeastMin(new Decimal(105), new Decimal(110)),
    ).toThrow(/出价需不低于/);
  });
});
