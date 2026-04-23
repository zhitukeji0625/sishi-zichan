import { Decimal } from "@prisma/client/runtime/library";

/** 当前最低可接受出价（无历史出价时为起拍价，否则为最高价加价幅）。 */
export function minNextBidAmount(
  startPrice: Decimal | string | number,
  bidStep: Decimal | string | number,
  highestBidAmount: Decimal | string | number | null | undefined,
): Decimal {
  const start = new Decimal(startPrice.toString());
  const step = new Decimal(bidStep.toString());
  if (highestBidAmount == null) return start;
  return new Decimal(highestBidAmount.toString()).plus(step);
}

export function assertBidMeetsMinimum(amount: Decimal, minNext: Decimal): void {
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
