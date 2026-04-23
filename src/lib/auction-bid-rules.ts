import { Decimal } from "@prisma/client/runtime/library";

export function nextMinimumBidAmount(params: {
  highestBidAmount: Decimal | null;
  startPrice: Decimal;
  bidStep: Decimal;
}): Decimal {
  const { highestBidAmount, startPrice, bidStep } = params;
  return highestBidAmount
    ? new Decimal(highestBidAmount.toString()).plus(bidStep.toString())
    : new Decimal(startPrice.toString());
}
