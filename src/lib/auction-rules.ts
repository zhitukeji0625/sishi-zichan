import { Decimal } from "@prisma/client/runtime/library";

/** 下一笔有效出价下限：无历史出价时为起拍价，否则为当前最高价 + 加价幅度 */
export function minNextBidAmount(params: {
  startPrice: Decimal | string;
  bidStep: Decimal | string;
  highestBidAmount: Decimal | string | null | undefined;
}): Decimal {
  const { startPrice, bidStep, highestBidAmount } = params;
  if (highestBidAmount == null) {
    return new Decimal(startPrice.toString());
  }
  return new Decimal(highestBidAmount.toString()).plus(bidStep.toString());
}
