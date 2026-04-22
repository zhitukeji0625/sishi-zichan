import { Decimal } from "@prisma/client/runtime/library";

/**
 * 下一笔有效出价不得低于的金额（首笔为起拍价，其后为当前最高价 + 加价幅度）。
 */
export function nextMinimumBidAmount(
  highestBidAmount: Decimal | null,
  startPrice: Decimal,
  bidStep: Decimal,
): Decimal {
  return highestBidAmount
    ? new Decimal(highestBidAmount.toString()).plus(bidStep.toString())
    : new Decimal(startPrice.toString());
}
