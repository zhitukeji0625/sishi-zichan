import { Decimal } from "@prisma/client/runtime/library";

/** 下一口最低可出价（无历史出价时为起拍价，否则为当前最高价 + 加价幅度） */
export function minNextBidAmount(params: {
  startPrice: Decimal | string | number;
  bidStep: Decimal | string | number;
  highestBidAmount: Decimal | string | number | null | undefined;
}): Decimal {
  const step = new Decimal(params.bidStep.toString());
  const start = new Decimal(params.startPrice.toString());
  if (params.highestBidAmount == null) {
    return start;
  }
  return new Decimal(params.highestBidAmount.toString()).plus(step);
}
