import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  assertAuctionProjectLive,
  assertBidAmountAtLeast,
  assertRegistrationEligible,
  getMinimumNextBidAmount,
} from "@/lib/auction";

describe("getMinimumNextBidAmount", () => {
  const project = { startPrice: new Decimal(100), bidStep: new Decimal(10) };

  it("returns start price when there is no prior bid", () => {
    expect(getMinimumNextBidAmount(project, null).toString()).toBe("100");
  });

  it("returns top bid plus step when a bid exists", () => {
    const top = { amount: new Decimal(100) };
    expect(getMinimumNextBidAmount(project, top).toString()).toBe("110");
  });
});

describe("assertBidAmountAtLeast", () => {
  it("allows amount equal to minimum", () => {
    expect(() =>
      assertBidAmountAtLeast(new Decimal(100), new Decimal(100)),
    ).not.toThrow();
  });

  it("rejects amount below minimum", () => {
    expect(() =>
      assertBidAmountAtLeast(new Decimal(105), new Decimal(110)),
    ).toThrow(/出价需不低于/);
  });
});

describe("assertAuctionProjectLive", () => {
  it("throws when project is missing or not LIVE", () => {
    expect(() => assertAuctionProjectLive(null)).toThrow("竞拍未在进行中");
    expect(() => assertAuctionProjectLive({ status: "ENDED" })).toThrow("竞拍未在进行中");
  });
});

describe("assertRegistrationEligible", () => {
  it("throws when registration is missing or invalid", () => {
    expect(() => assertRegistrationEligible(null)).toThrow("无出价资格");
    expect(() =>
      assertRegistrationEligible({ status: "PENDING", depositPaid: false }),
    ).toThrow("无出价资格");
  });
});
