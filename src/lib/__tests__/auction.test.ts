import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { assertAuctionBidAllowed } from "@/lib/auction";

const liveProject = {
  status: "LIVE" as const,
  startPrice: new Decimal(100),
  bidStep: new Decimal(10),
};

const approvedReg = { status: "APPROVED" as const, depositPaid: true };

describe("assertAuctionBidAllowed", () => {
  it("accepts first bid at start price", () => {
    expect(() =>
      assertAuctionBidAllowed({
        project: liveProject,
        registration: approvedReg,
        highestBidAmount: null,
        amount: new Decimal(100),
      }),
    ).not.toThrow();
  });

  it("rejects bid below start price when there is no prior bid", () => {
    expect(() =>
      assertAuctionBidAllowed({
        project: liveProject,
        registration: approvedReg,
        highestBidAmount: null,
        amount: new Decimal(99),
      }),
    ).toThrow(/出价需不低于/);
  });

  it("requires next bid to be at least highest + bid step", () => {
    expect(() =>
      assertAuctionBidAllowed({
        project: liveProject,
        registration: approvedReg,
        highestBidAmount: new Decimal(100),
        amount: new Decimal(105),
      }),
    ).toThrow(/出价需不低于/);
  });

  it("accepts bid at exactly highest + bid step", () => {
    expect(() =>
      assertAuctionBidAllowed({
        project: liveProject,
        registration: approvedReg,
        highestBidAmount: new Decimal(100),
        amount: new Decimal(110),
      }),
    ).not.toThrow();
  });

  it("rejects when project missing or not LIVE", () => {
    expect(() =>
      assertAuctionBidAllowed({
        project: null,
        registration: approvedReg,
        highestBidAmount: null,
        amount: new Decimal(100),
      }),
    ).toThrow("竞拍未在进行中");
    expect(() =>
      assertAuctionBidAllowed({
        project: { ...liveProject, status: "ENDED" },
        registration: approvedReg,
        highestBidAmount: null,
        amount: new Decimal(100),
      }),
    ).toThrow("竞拍未在进行中");
  });

  it("rejects when registration missing, not approved, or deposit unpaid", () => {
    expect(() =>
      assertAuctionBidAllowed({
        project: liveProject,
        registration: null,
        highestBidAmount: null,
        amount: new Decimal(100),
      }),
    ).toThrow("无出价资格");
    expect(() =>
      assertAuctionBidAllowed({
        project: liveProject,
        registration: { status: "PENDING", depositPaid: true },
        highestBidAmount: null,
        amount: new Decimal(100),
      }),
    ).toThrow("无出价资格");
    expect(() =>
      assertAuctionBidAllowed({
        project: liveProject,
        registration: { status: "APPROVED", depositPaid: false },
        highestBidAmount: null,
        amount: new Decimal(100),
      }),
    ).toThrow("无出价资格");
  });
});
