import { Decimal } from "@prisma/client/runtime/library";

/** 下一笔有效出价的最低金额：无历史出价时为起拍价，否则为当前最高价 + 加价幅度。 */
export function getMinNextBidAmount(input: {
  startPrice: { toString(): string };
  bidStep: { toString(): string };
  highestBidAmount: { toString(): string } | null | undefined;
}): Decimal {
  const start = new Decimal(input.startPrice.toString());
  const step = new Decimal(input.bidStep.toString());
  const hi = input.highestBidAmount;
  if (hi == null) return start;
  return new Decimal(hi.toString()).plus(step);
}
