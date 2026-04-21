import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  assertAmountMeetsMin,
  assertLiveProject,
  assertRegistrationAllowsBid,
  computeMinNextBid,
} from "@/lib/auction-core";

describe("computeMinNextBid", () => {
  it("uses start price when there is no prior bid", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestAmount: null,
    });
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid", () => {
    const min = computeMinNextBid({
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      highestAmount: new Decimal(100),
    });
    expect(min.toString()).toBe("110");
  });
});

describe("assertLiveProject", () => {
  it("throws when project is null", () => {
    expect(() => assertLiveProject(null)).toThrow("竞拍未在进行中");
  });

  it("throws when project is not LIVE", () => {
    expect(() => assertLiveProject({ status: "ENDED" })).toThrow("竞拍未在进行中");
  });

  it("does not throw for LIVE project", () => {
    expect(() => assertLiveProject({ status: "LIVE" })).not.toThrow();
  });
});

describe("assertRegistrationAllowsBid", () => {
  it("throws when registration is missing", () => {
    expect(() => assertRegistrationAllowsBid(null)).toThrow("无出价资格");
  });

  it("throws when not approved", () => {
    expect(() =>
      assertRegistrationAllowsBid({
        status: "PENDING",
        depositPaid: true,
      }),
    ).toThrow("无出价资格");
  });

  it("throws when deposit not paid", () => {
    expect(() =>
      assertRegistrationAllowsBid({
        status: "APPROVED",
        depositPaid: false,
      }),
    ).toThrow("无出价资格");
  });
});

describe("assertAmountMeetsMin", () => {
  it("throws when amount is below minimum", () => {
    expect(() =>
      assertAmountMeetsMin(new Decimal(105), new Decimal(110)),
    ).toThrow("出价需不低于");
  });

  it("does not throw when amount equals minimum", () => {
    expect(() =>
      assertAmountMeetsMin(new Decimal(110), new Decimal(110)),
    ).not.toThrow();
  });
});
