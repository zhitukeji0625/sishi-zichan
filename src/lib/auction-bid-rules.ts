import { Decimal } from "@prisma/client/runtime/library";

export function minNextBidAmount(params: {
  startPrice: Decimal | string | number;
  bidStep: Decimal | string | number;
  highestBidAmount: Decimal | string | number | null;
}): Decimal {
  const start = new Decimal(params.startPrice.toString());
  const step = new Decimal(params.bidStep.toString());
  if (params.highestBidAmount == null) {
    return start;
  }
  return new Decimal(params.highestBidAmount.toString()).plus(step);
}

export function assertBidMeetsMinimum(amount: Decimal, minNext: Decimal): void {
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
