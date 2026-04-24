import { Decimal } from "@prisma/client/runtime/library";

/** 下一笔有效出价须达到的最低金额（无出价时为起拍价，否则为当前最高价加价幅度）。 */
export function getMinNextBidAmount(input: {
  highestBidAmount: Decimal | string | null | undefined;
  startPrice: Decimal | string;
  bidStep: Decimal | string;
}): Decimal {
  const start = new Decimal(input.startPrice.toString());
  const step = new Decimal(input.bidStep.toString());
  if (input.highestBidAmount == null) return start;
  return new Decimal(input.highestBidAmount.toString()).plus(step);
}
