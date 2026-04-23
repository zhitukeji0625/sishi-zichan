import { Decimal } from "@prisma/client/runtime/library";

/**
 * 计算下一口有效出价的下限：无历史出价时为起拍价，否则为当前最高价加加价幅度。
 */
export function computeMinNextBid(params: {
  highestBidAmount: Decimal | null | undefined;
  startPrice: Decimal;
  bidStep: Decimal;
}): Decimal {
  const { highestBidAmount, startPrice, bidStep } = params;
  if (highestBidAmount == null) {
    return new Decimal(startPrice.toString());
  }
  return new Decimal(highestBidAmount.toString()).plus(bidStep.toString());
}
