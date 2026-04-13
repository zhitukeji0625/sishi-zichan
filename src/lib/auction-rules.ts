import { Decimal } from "@prisma/client/runtime/library";

export function minNextBidAmount(params: {
  highestBidAmount: Decimal | null;
  startPrice: Decimal;
  bidStep: Decimal;
}): Decimal {
  const { highestBidAmount, startPrice, bidStep } = params;
  return highestBidAmount
    ? new Decimal(highestBidAmount.toString()).plus(bidStep.toString())
    : new Decimal(startPrice.toString());
}

export function validateBidAgainstMinimum(params: {
  amount: Decimal;
  highestBidAmount: Decimal | null;
  startPrice: Decimal;
  bidStep: Decimal;
}): void {
  const { amount, highestBidAmount, startPrice, bidStep } = params;
  const minNext = minNextBidAmount({ highestBidAmount, startPrice, bidStep });
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
