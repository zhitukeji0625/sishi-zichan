import { Decimal } from "@prisma/client/runtime/library";

/** 下一口最低可接受价：无历史出价时为起拍价，否则为当前最高价加价幅。 */
export function computeMinNextBid(params: {
  topBidAmount: Decimal | string | null | undefined;
  startPrice: Decimal | string;
  bidStep: Decimal | string;
}): Decimal {
  const startPrice = new Decimal(params.startPrice.toString());
  const bidStep = new Decimal(params.bidStep.toString());
  if (params.topBidAmount == null) {
    return startPrice;
  }
  const top = new Decimal(params.topBidAmount.toString());
  return top.plus(bidStep);
}
