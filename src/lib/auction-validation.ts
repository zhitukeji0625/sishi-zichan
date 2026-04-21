import { Decimal } from "@prisma/client/runtime/library";

type RegistrationForBid = {
  status: string;
  depositPaid: boolean;
} | null;

/**
 * 竞拍出价校验（纯函数，便于在无数据库环境下单元测试）。
 * 与 {@link placeBid} 中的业务规则保持一致。
 */
export function validateBidAmount(params: {
  project: { status: string } | null;
  registration: RegistrationForBid;
  highestBidAmount: Decimal | null;
  startPrice: Decimal;
  bidStep: Decimal;
  amount: Decimal;
}): void {
  const { project, registration, highestBidAmount, startPrice, bidStep, amount } = params;

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

  const minNext = highestBidAmount
    ? new Decimal(highestBidAmount.toString()).plus(bidStep.toString())
    : new Decimal(startPrice.toString());

  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
