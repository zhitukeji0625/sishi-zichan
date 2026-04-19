import { Decimal } from "@prisma/client/runtime/library";

/** 计算当前场次允许的最低下一口价（不含资格校验）。 */
export function minNextBidAmount(params: {
  startPrice: Decimal | string | number;
  bidStep: Decimal | string | number;
  highestBidAmount: Decimal | string | number | null;
}): Decimal {
  const bidStep = new Decimal(params.bidStep.toString());
  const startPrice = new Decimal(params.startPrice.toString());
  const top = params.highestBidAmount;
  return top != null
    ? new Decimal(top.toString()).plus(bidStep)
    : startPrice;
}
