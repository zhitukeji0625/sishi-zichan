import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getNextMinimumBidAmount,
  validatePlaceBidInput,
} from "@/lib/auction";

const liveProject = {
  status: "LIVE" as const,
  startPrice: new Decimal(100),
  bidStep: new Decimal(10),
};

const approvedReg = {
  status: "APPROVED" as const,
  depositPaid: true,
};

describe("getNextMinimumBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    const min = getNextMinimumBidAmount(liveProject, null);
    expect(min.toString()).toBe("100");
  });

  it("adds bid step to highest bid", () => {
    const min = getNextMinimumBidAmount(liveProject, new Decimal(100));
    expect(min.toString()).toBe("110");
  });
});

describe("validatePlaceBidInput", () => {
  it("accepts first bid at start price", () => {
    expect(() =>
      validatePlaceBidInput({
        project: liveProject,
        reg: approvedReg,
        amount: new Decimal(100),
        highestBidAmount: null,
      }),
    ).not.toThrow();
  });

  it("rejects bid below min increment after a prior bid", () => {
    expect(() =>
      validatePlaceBidInput({
        project: liveProject,
        reg: approvedReg,
        amount: new Decimal(105),
        highestBidAmount: new Decimal(100),
      }),
    ).toThrow(/出价需不低于/);
  });

  it("rejects when project is not live", () => {
    expect(() =>
      validatePlaceBidInput({
        project: { ...liveProject, status: "SCHEDULED" },
        reg: approvedReg,
        amount: new Decimal(100),
        highestBidAmount: null,
      }),
    ).toThrow("竞拍未在进行中");
  });

  it("rejects when registration is missing or invalid", () => {
    expect(() =>
      validatePlaceBidInput({
        project: liveProject,
        reg: null,
        amount: new Decimal(100),
        highestBidAmount: null,
      }),
    ).toThrow("无出价资格");
  });
});
