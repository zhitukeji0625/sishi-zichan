import { Decimal } from "@prisma/client/runtime/library";

/** 当前最高价存在时：最高价 + 步长；否则为起拍价。 */
export function getMinimumNextBidAmount(params: {
  startPrice: string;
  bidStep: string;
  highestBidAmount: string | null;
}): Decimal {
  const { startPrice, bidStep, highestBidAmount } = params;
  if (highestBidAmount != null) {
    return new Decimal(highestBidAmount).plus(bidStep);
  }
  return new Decimal(startPrice);
}

export function validateBidAmount(amount: Decimal, minNext: Decimal): void {
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
