import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { assertPlaceBidAllowed } from "@/lib/auction";

const liveProject = {
  status: "LIVE",
  startPrice: new Decimal(100),
  bidStep: new Decimal(10),
};

const approvedReg = { status: "APPROVED", depositPaid: true };

describe("assertPlaceBidAllowed", () => {
  it("accepts first bid at start price", () => {
    expect(() =>
      assertPlaceBidAllowed({
        project: liveProject,
        registration: approvedReg,
        topBidAmount: null,
        amount: new Decimal(100),
      }),
    ).not.toThrow();
  });

  it("rejects bid below min increment", () => {
    expect(() =>
      assertPlaceBidAllowed({
        project: liveProject,
        registration: approvedReg,
        topBidAmount: new Decimal(100),
        amount: new Decimal(105),
      }),
    ).toThrow(/出价需不低于/);
  });

  it("rejects when project is not live", () => {
    expect(() =>
      assertPlaceBidAllowed({
        project: { ...liveProject, status: "ENDED" },
        registration: approvedReg,
        topBidAmount: null,
        amount: new Decimal(100),
      }),
    ).toThrow("竞拍未在进行中");
  });

  it("rejects when registration is missing or invalid", () => {
    expect(() =>
      assertPlaceBidAllowed({
        project: liveProject,
        registration: null,
        topBidAmount: null,
        amount: new Decimal(100),
      }),
    ).toThrow("无出价资格");
  });
});
