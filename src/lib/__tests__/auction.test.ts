import type { AuctionRegistration } from "@prisma/client";
import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  minRequiredBidAmount,
  assertBidRegistration,
} from "@/lib/auction";

function reg(partial: Partial<AuctionRegistration>): AuctionRegistration {
  return {
    id: "r1",
    projectId: "p1",
    endUserId: "u1",
    status: "PENDING",
    rejectReason: null,
    depositPaid: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("minRequiredBidAmount", () => {
  const startPrice = new Decimal(100);
  const bidStep = new Decimal(10);

  it("uses start price when there is no prior bid", () => {
    expect(
      minRequiredBidAmount({
        startPrice,
        bidStep,
        highestBidAmount: null,
      }).toString(),
    ).toBe("100");
  });

  it("requires highest bid plus step when bids exist", () => {
    expect(
      minRequiredBidAmount({
        startPrice,
        bidStep,
        highestBidAmount: new Decimal(100),
      }).toString(),
    ).toBe("110");
  });
});

describe("assertBidRegistration", () => {
  it("throws when registration is missing", () => {
    expect(() => assertBidRegistration(null)).toThrow(
      "无出价资格，请完成报名与保证金",
    );
  });

  it("throws when not approved or deposit unpaid", () => {
    expect(() =>
      assertBidRegistration(reg({ status: "PENDING", depositPaid: false })),
    ).toThrow("无出价资格，请完成报名与保证金");
  });

  it("does not throw when approved and deposit paid", () => {
    expect(() =>
      assertBidRegistration(reg({ status: "APPROVED", depositPaid: true })),
    ).not.toThrow();
  });
});

describe("placeBid amount rules (mirrors integration expectations)", () => {
  const startPrice = new Decimal(100);
  const bidStep = new Decimal(10);

  it("first acceptable bid equals start price", () => {
    const min = minRequiredBidAmount({
      startPrice,
      bidStep,
      highestBidAmount: null,
    });
    expect(new Decimal(100).lessThan(min)).toBe(false);
  });

  it("bid one step below next minimum is rejected by same comparison as placeBid", () => {
    const minAfterFirst = minRequiredBidAmount({
      startPrice,
      bidStep,
      highestBidAmount: new Decimal(100),
    });
    expect(new Decimal(105).lessThan(minAfterFirst)).toBe(true);
  });
});
