import { Decimal } from "@prisma/client/runtime/library";

/** 当前最高价（若无则为 null）下，下一口合法最低出价。 */
export function getMinNextBidAmount(params: {
  highestBidAmount: Decimal | null;
  startPrice: Decimal;
  bidStep: Decimal;
}): Decimal {
  const { highestBidAmount, startPrice, bidStep } = params;
  if (highestBidAmount == null) {
    return new Decimal(startPrice.toString());
  }
  return new Decimal(highestBidAmount.toString()).plus(bidStep.toString());
}

export function assertBidMeetsMinimum(amount: Decimal, minNext: Decimal): void {
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
