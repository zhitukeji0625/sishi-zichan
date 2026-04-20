import { Decimal } from "@prisma/client/runtime/library";

/** 下一口最低可接受价：无历史出价时为起拍价，否则为当前最高价加价幅。 */
export function computeMinNextBidAmount(params: {
  startPrice: string;
  bidStep: string;
  highestBidAmount: string | null;
}): Decimal {
  const { startPrice, bidStep, highestBidAmount } = params;
  return highestBidAmount != null
    ? new Decimal(highestBidAmount).plus(bidStep)
    : new Decimal(startPrice);
}
