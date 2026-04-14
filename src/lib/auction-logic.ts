import { Decimal } from "@prisma/client/runtime/library";

/** 下一口有效出价的下限：无历史出价时为起拍价，否则为当前最高价加加价幅度。 */
export function computeMinNextBidAmount(params: {
  startPrice: Decimal | string | number;
  bidStep: Decimal | string | number;
  highestBidAmount: Decimal | string | number | null | undefined;
}): Decimal {
  const step = new Decimal(params.bidStep.toString());
  const start = new Decimal(params.startPrice.toString());
  const top = params.highestBidAmount;
  if (top == null) {
    return start;
  }
  return new Decimal(top.toString()).plus(step);
}
