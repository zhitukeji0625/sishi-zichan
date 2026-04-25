import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  const project = {
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("无历史出价时最低价为起拍价", () => {
    expect(minNextBidAmount(null, project).toString()).toBe("100");
  });

  it("有最高价时最低价为最高价加价阶", () => {
    expect(
      minNextBidAmount({ amount: new Decimal(150) }, project).toString(),
    ).toBe("160");
  });
});
