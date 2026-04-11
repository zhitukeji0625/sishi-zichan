import { Decimal } from "@prisma/client/runtime/library";

export function minNextBidAmount(params: {
  startPrice: string;
  bidStep: string;
  topBidAmount: string | null;
}): Decimal {
  const { startPrice, bidStep, topBidAmount } = params;
  return topBidAmount
    ? new Decimal(topBidAmount).plus(bidStep)
    : new Decimal(startPrice);
}

/** 与 placeBid 中一致的校验（便于无数据库单元测试） */
export function assertCanPlaceBid(params: {
  project: { status: string; startPrice: string; bidStep: string } | null;
  registration: { status: string; depositPaid: boolean } | null;
  topBidAmount: string | null;
  amount: Decimal;
}): void {
  const { project, registration, topBidAmount, amount } = params;
  if (!project || project.status !== "LIVE") {
    throw new Error("竞拍未在进行中");
  }
  if (
    !registration ||
    registration.status !== "APPROVED" ||
    !registration.depositPaid
  ) {
    throw new Error("无出价资格，请完成报名与保证金");
  }
  const minNext = minNextBidAmount({
    startPrice: project.startPrice,
    bidStep: project.bidStep,
    topBidAmount,
  });
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
