import { describe, it, expect } from "vitest";
import { computeMinNextBidAmount } from "@/lib/auction";

describe("computeMinNextBidAmount", () => {
  it("无历史出价时为起拍价", () => {
    expect(computeMinNextBidAmount(null, "100", "10").toString()).toBe("100");
  });

  it("有历史出价时为最高价加价幅", () => {
    expect(computeMinNextBidAmount("100", "50", "10").toString()).toBe("110");
  });

  it("小数起拍价与步长", () => {
    expect(computeMinNextBidAmount(null, "99.5", "0.5").toString()).toBe("99.5");
    expect(computeMinNextBidAmount("99.5", "1", "0.5").toString()).toBe("100");
  });
});
