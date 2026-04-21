import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { validateBidAmount } from "@/lib/auction-validation";

describe("validateBidAmount", () => {
  const liveProject = { status: "LIVE" as const };
  const approvedReg = { status: "APPROVED", depositPaid: true };

  it("accepts first bid at start price", () => {
    expect(() =>
      validateBidAmount({
        project: liveProject,
        registration: approvedReg,
        highestBidAmount: null,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        amount: new Decimal(100),
      }),
    ).not.toThrow();
  });

  it("rejects bid below min increment", () => {
    expect(() =>
      validateBidAmount({
        project: liveProject,
        registration: approvedReg,
        highestBidAmount: new Decimal(100),
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        amount: new Decimal(105),
      }),
    ).toThrow();
  });

  it("rejects when project is not live", () => {
    expect(() =>
      validateBidAmount({
        project: { status: "ENDED" },
        registration: approvedReg,
        highestBidAmount: null,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        amount: new Decimal(100),
      }),
    ).toThrow("竞拍未在进行中");
  });

  it("rejects without approved registration", () => {
    expect(() =>
      validateBidAmount({
        project: liveProject,
        registration: { status: "PENDING", depositPaid: true },
        highestBidAmount: null,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        amount: new Decimal(100),
      }),
    ).toThrow("无出价资格");
  });
});
