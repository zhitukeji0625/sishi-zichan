import { Decimal } from "@prisma/client/runtime/library";

/** 下一笔有效出价的最低金额（无历史出价时为起拍价）。 */
export function computeMinNextBidAmount(params: {
  startPrice: Decimal | string;
  bidStep: Decimal | string;
  highestBidAmount: Decimal | string | null | undefined;
}): Decimal {
  const step = new Decimal(params.bidStep.toString());
  const start = new Decimal(params.startPrice.toString());
  if (params.highestBidAmount == null) {
    return start;
  }
  return new Decimal(params.highestBidAmount.toString()).plus(step);
}

export function assertBidMeetsMinimum(amount: Decimal, minNext: Decimal): void {
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
