import { Decimal } from "@prisma/client/runtime/library";

/** 下一口最低可接受价：无历史出价时为起拍价，否则为当前最高价加加价步长。 */
export function computeMinNextBid(params: {
  startPrice: Decimal | string | number;
  bidStep: Decimal | string | number;
  highestBidAmount: Decimal | string | number | null | undefined;
}): Decimal {
  const { startPrice, bidStep, highestBidAmount } = params;
  if (highestBidAmount == null) {
    return new Decimal(startPrice.toString());
  }
  return new Decimal(highestBidAmount.toString()).plus(bidStep.toString());
}
