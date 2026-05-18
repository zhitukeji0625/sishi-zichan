import { describe, it, expect } from "vitest";
import { computeMinimumNextBid } from "@/lib/auction";

describe("computeMinimumNextBid", () => {
  it("无历史出价时为起拍价", () => {
    expect(computeMinimumNextBid("100", "10", null).toString()).toBe("100");
  });

  it("有最高价时为最高价加价幅度", () => {
    expect(computeMinimumNextBid("100", "10", "100").toString()).toBe("110");
    expect(computeMinimumNextBid("99.5", "0.5", "120").toString()).toBe("120.5");
  });

  it("小数起拍与步长", () => {
    expect(computeMinimumNextBid("0.01", "0.01", null).toString()).toBe("0.01");
  });
});
