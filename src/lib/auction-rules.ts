import { Decimal } from "@prisma/client/runtime/library";

/** 当前最高价（若无则为 null）下，下一笔有效出价不得低于的金额 */
export function minNextBidAmount(params: {
  highestBidAmount: Decimal | null;
  startPrice: Decimal;
  bidStep: Decimal;
}): Decimal {
  const { highestBidAmount, startPrice, bidStep } = params;
  return highestBidAmount
    ? new Decimal(highestBidAmount.toString()).plus(bidStep.toString())
    : new Decimal(startPrice.toString());
}
