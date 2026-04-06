import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  minNextBidAmount,
  assertBidAtLeastMin,
} from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("首笔出价为起拍价", () => {
    const min = minNextBidAmount({
      highestBidAmount: null,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("100");
  });

  it("有最高出价时为最高 + 加价幅度", () => {
    const min = minNextBidAmount({
      highestBidAmount: new Decimal(100),
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    expect(min.toString()).toBe("110");
  });
});

describe("assertBidAtLeastMin", () => {
  it("等于最低出价时不抛错", () => {
    expect(() =>
      assertBidAtLeastMin(new Decimal(100), new Decimal(100)),
    ).not.toThrow();
  });

  it("低于最低加价要求时抛错", () => {
    expect(() =>
      assertBidAtLeastMin(new Decimal(105), new Decimal(110)),
    ).toThrow(/出价需不低于/);
  });
});
