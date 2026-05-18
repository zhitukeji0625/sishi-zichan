import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  const start = new Decimal(100);
  const step = new Decimal(10);

  it("无历史出价时等于起拍价", () => {
    expect(
      minNextBidAmount({
        highestAmount: null,
        startPrice: start,
        bidStep: step,
      }).toString(),
    ).toBe("100");
  });

  it("无历史出价时忽略最高价 undefined", () => {
    expect(
      minNextBidAmount({
        highestAmount: undefined,
        startPrice: start,
        bidStep: step,
      }).toString(),
    ).toBe("100");
  });

  it("有历史出价时为最高价加价幅", () => {
    expect(
      minNextBidAmount({
        highestAmount: new Decimal(100),
        startPrice: start,
        bidStep: step,
      }).toString(),
    ).toBe("110");
  });
});
