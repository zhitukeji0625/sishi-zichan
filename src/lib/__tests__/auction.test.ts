import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { assertCanPlaceBid, minNextBidAmount } from "@/lib/auction-rules";

describe("minNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    expect(
      minNextBidAmount({
        startPrice: "100",
        bidStep: "10",
        topBidAmount: null,
      }).toString(),
    ).toBe("100");
  });

  it("adds bid step to highest bid when present", () => {
    expect(
      minNextBidAmount({
        startPrice: "100",
        bidStep: "10",
        topBidAmount: "100",
      }).toString(),
    ).toBe("110");
  });
});

describe("assertCanPlaceBid", () => {
  const liveProject = {
    status: "LIVE" as const,
    startPrice: "100",
    bidStep: "10",
  };
  const approvedReg = { status: "APPROVED" as const, depositPaid: true };

  it("accepts first bid at start price", () => {
    expect(() =>
      assertCanPlaceBid({
        project: liveProject,
        registration: approvedReg,
        topBidAmount: null,
        amount: new Decimal(100),
      }),
    ).not.toThrow();
  });

  it("rejects bid below min increment", () => {
    expect(() =>
      assertCanPlaceBid({
        project: liveProject,
        registration: approvedReg,
        topBidAmount: "100",
        amount: new Decimal(105),
      }),
    ).toThrow();
  });

  it("rejects when project is not live", () => {
    expect(() =>
      assertCanPlaceBid({
        project: { ...liveProject, status: "ENDED" },
        registration: approvedReg,
        topBidAmount: null,
        amount: new Decimal(100),
      }),
    ).toThrow("竞拍未在进行中");
  });

  it("rejects when registration is missing or invalid", () => {
    expect(() =>
      assertCanPlaceBid({
        project: liveProject,
        registration: null,
        topBidAmount: null,
        amount: new Decimal(100),
      }),
    ).toThrow("无出价资格");
  });
});
