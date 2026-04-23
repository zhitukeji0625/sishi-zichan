import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  assertBidAmountAtLeastMin,
  computeMinNextBidAmount,
  validatePlaceBidPrerequisites,
} from "@/lib/auction-logic";

describe("validatePlaceBidPrerequisites", () => {
  it("throws when project missing or not LIVE", () => {
    expect(() => validatePlaceBidPrerequisites(null, null)).toThrow("竞拍未在进行中");
    expect(() =>
      validatePlaceBidPrerequisites({ status: "ENDED" }, { status: "APPROVED", depositPaid: true }),
    ).toThrow("竞拍未在进行中");
  });

  it("throws when registration invalid", () => {
    expect(() =>
      validatePlaceBidPrerequisites({ status: "LIVE" }, null),
    ).toThrow("无出价资格");
    expect(() =>
      validatePlaceBidPrerequisites(
        { status: "LIVE" },
        { status: "PENDING", depositPaid: true },
      ),
    ).toThrow("无出价资格");
    expect(() =>
      validatePlaceBidPrerequisites(
        { status: "LIVE" },
        { status: "APPROVED", depositPaid: false },
      ),
    ).toThrow("无出价资格");
  });

  it("passes when project LIVE and registration approved with deposit", () => {
    expect(() =>
      validatePlaceBidPrerequisites(
        { status: "LIVE" },
        { status: "APPROVED", depositPaid: true },
      ),
    ).not.toThrow();
  });
});

describe("computeMinNextBidAmount", () => {
  it("returns start price when no prior bid", () => {
    const min = computeMinNextBidAmount(100, 10, null);
    expect(min.toString()).toBe("100");
  });

  it("returns top plus step when prior bid exists", () => {
    const min = computeMinNextBidAmount(100, 10, new Decimal(150));
    expect(min.toString()).toBe("160");
  });
});

describe("assertBidAmountAtLeastMin", () => {
  it("throws when amount below minimum", () => {
    expect(() =>
      assertBidAmountAtLeastMin(new Decimal(105), new Decimal(110)),
    ).toThrow("出价需不低于");
  });

  it("allows amount at minimum", () => {
    expect(() =>
      assertBidAmountAtLeastMin(new Decimal(110), new Decimal(110)),
    ).not.toThrow();
  });
});
