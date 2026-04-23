import { Decimal } from "@prisma/client/runtime/library";

/** 当前最高价（若有）与起拍价、加价幅度，计算下一口允许的最低金额。 */
export function computeMinimumNextBid(params: {
  highestBidAmount: Decimal | null;
  startPrice: Decimal;
  bidStep: Decimal;
}): Decimal {
  const { highestBidAmount, startPrice, bidStep } = params;
  if (highestBidAmount != null) {
    return new Decimal(highestBidAmount.toString()).plus(bidStep.toString());
  }
  return new Decimal(startPrice.toString());
}

export function assertBidAtLeastMinimum(amount: Decimal, minNext: Decimal): void {
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
