import { Decimal } from "@prisma/client/runtime/library";

/** 下一口有效出价下限：无历史出价时为起拍价，否则为当前最高价加加价幅度。 */
export function minimumNextBidAmount(params: {
  startPrice: Decimal | string | number;
  bidStep: Decimal | string | number;
  highestBidAmount: Decimal | string | number | null;
}) {
  const start = new Decimal(params.startPrice.toString());
  const step = new Decimal(params.bidStep.toString());
  if (params.highestBidAmount == null) {
    return start;
  }
  return new Decimal(params.highestBidAmount.toString()).plus(step);
}
