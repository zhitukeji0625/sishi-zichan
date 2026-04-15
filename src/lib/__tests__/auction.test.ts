import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { minimumNextBidAmount } from "@/lib/auction";

describe("minimumNextBidAmount", () => {
  const project = {
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("首笔出价须为起拍价", () => {
    expect(minimumNextBidAmount(project, null).toString()).toBe("100");
  });

  it("有最高价后下一笔须为最高价加加价幅度", () => {
    expect(minimumNextBidAmount(project, "100").toString()).toBe("110");
  });
});
