import { Decimal } from "@prisma/client/runtime/library";

/** 下一笔有效出价的最低金额（无历史出价时为起拍价，否则为当前最高价加价幅）。 */
export function minNextBidAmount(params: {
  startPrice: string | number | Decimal;
  bidStep: string | number | Decimal;
  highestBidAmount?: string | number | Decimal | null;
}): Decimal {
  const step = new Decimal(params.bidStep.toString());
  const top = params.highestBidAmount;
  if (top != null && top !== "") {
    return new Decimal(top.toString()).plus(step);
  }
  return new Decimal(params.startPrice.toString());
}
