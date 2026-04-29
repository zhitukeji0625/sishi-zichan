import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { assertBidAllowed } from "@/lib/auction-logic";

function approvedReg() {
  return { status: "APPROVED" as const, depositPaid: true };
}

describe("assertBidAllowed", () => {
  it("allows first bid at start price when LIVE", () => {
    expect(() =>
      assertBidAllowed(
        {
          projectStatus: "LIVE",
          startPrice: new Decimal(100),
          bidStep: new Decimal(10),
          topBidAmount: null,
          registration: approvedReg(),
        },
        new Decimal(100),
      ),
    ).not.toThrow();
  });

  it("rejects bid below min increment after a top bid", () => {
    expect(() =>
      assertBidAllowed(
        {
          projectStatus: "LIVE",
          startPrice: new Decimal(100),
          bidStep: new Decimal(10),
          topBidAmount: new Decimal(100),
          registration: approvedReg(),
        },
        new Decimal(105),
      ),
    ).toThrow(/出价需不低于/);
  });

  it("rejects when project not LIVE", () => {
    expect(() =>
      assertBidAllowed(
        {
          projectStatus: "ENDED",
          startPrice: new Decimal(100),
          bidStep: new Decimal(10),
          topBidAmount: null,
          registration: approvedReg(),
        },
        new Decimal(100),
      ),
    ).toThrow("竞拍未在进行中");
  });

  it("rejects without approved registration or deposit", () => {
    expect(() =>
      assertBidAllowed(
        {
          projectStatus: "LIVE",
          startPrice: new Decimal(100),
          bidStep: new Decimal(10),
          topBidAmount: null,
          registration: { status: "APPROVED", depositPaid: false },
        },
        new Decimal(100),
      ),
    ).toThrow("无出价资格");
  });
});
