import { Decimal } from "@prisma/client/runtime/library";

/** 下一笔有效出价的最低金额（无历史出价时为起拍价，否则为当前最高价加加价幅度）。 */
export function computeMinNextBid(params: {
  startPrice: Decimal | string | number;
  bidStep: Decimal | string | number;
  highestAmount: Decimal | string | number | null | undefined;
}): Decimal {
  const start = new Decimal(params.startPrice.toString());
  const step = new Decimal(params.bidStep.toString());
  if (params.highestAmount == null) {
    return start;
  }
  return new Decimal(params.highestAmount.toString()).plus(step);
}
