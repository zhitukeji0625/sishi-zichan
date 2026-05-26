import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMinRequiredBidAmount } from "@/lib/auction";

describe("getMinRequiredBidAmount", () => {
  it("首拍：最低价为起拍价", () => {
    const min = getMinRequiredBidAmount(
      new Decimal(100),
      new Decimal(10),
      null,
    );
    expect(min.toString()).toBe("100");
  });

  it("已有最高价：最低价为最高价加步长", () => {
    const min = getMinRequiredBidAmount(
      new Decimal(100),
      new Decimal(10),
      new Decimal(100),
    );
    expect(min.toString()).toBe("110");
  });
});
