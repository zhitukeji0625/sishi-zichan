import { Decimal } from "@prisma/client/runtime/library";

/** 下一口有效最低出价（无历史出价时为起拍价，否则为当前最高价 + 加价幅度）。 */
export function computeMinNextBid(params: {
  startPrice: string | Decimal;
  bidStep: string | Decimal;
  highestBidAmount: string | Decimal | null;
}): Decimal {
  const step = new Decimal(params.bidStep.toString());
  if (params.highestBidAmount == null) {
    return new Decimal(params.startPrice.toString());
  }
  return new Decimal(params.highestBidAmount.toString()).plus(step);
}

export function validateBidAmount(amount: Decimal, minNext: Decimal): void {
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
