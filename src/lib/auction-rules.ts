import { Decimal } from "@prisma/client/runtime/library";

/** 下一口最低可接受出价（无历史出价时为起拍价）。 */
export function computeMinNextBid(params: {
  startPrice: Decimal | string | number;
  bidStep: Decimal | string | number;
  topBidAmount: Decimal | string | number | null | undefined;
}): Decimal {
  const startPrice = new Decimal(params.startPrice.toString());
  const bidStep = new Decimal(params.bidStep.toString());
  if (params.topBidAmount == null) {
    return startPrice;
  }
  return new Decimal(params.topBidAmount.toString()).plus(bidStep);
}
