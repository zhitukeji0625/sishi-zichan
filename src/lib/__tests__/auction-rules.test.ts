import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMinNextBidAmount } from "@/lib/auction";

describe("getMinNextBidAmount", () => {
  const project = {
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("returns start price when there is no prior bid", () => {
    expect(getMinNextBidAmount(project, null).toString()).toBe("100");
    expect(getMinNextBidAmount(project, undefined).toString()).toBe("100");
  });

  it("returns highest bid plus step when there is a prior bid", () => {
    expect(getMinNextBidAmount(project, new Decimal(100)).toString()).toBe("110");
    expect(getMinNextBidAmount(project, "150").toString()).toBe("160");
  });
});
