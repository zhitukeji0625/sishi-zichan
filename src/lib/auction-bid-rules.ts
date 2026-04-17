import { Decimal } from "@prisma/client/runtime/library";

type Decimalish = Decimal | string | number | { toString(): string };

function toDecimal(value: Decimalish): Decimal {
  return new Decimal(value.toString());
}

export function minNextBidAmount(params: {
  startPrice: Decimalish;
  bidStep: Decimalish;
  highestBidAmount: Decimalish | null | undefined;
}): Decimal {
  const start = toDecimal(params.startPrice);
  const step = toDecimal(params.bidStep);
  if (params.highestBidAmount == null) return start;
  return toDecimal(params.highestBidAmount).plus(step.toString());
}

export function assertBidMeetsMinimum(params: {
  amount: Decimal;
  minNext: Decimal;
}): void {
  const { amount, minNext } = params;
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
