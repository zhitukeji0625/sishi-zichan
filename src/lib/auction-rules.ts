import { Decimal } from "@prisma/client/runtime/library";

/** 下一口有效最低出价：无历史出价时为起拍价，否则为当前最高价加加价幅度。 */
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
