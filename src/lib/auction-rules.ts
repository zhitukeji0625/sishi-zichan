import { Decimal } from "@prisma/client/runtime/library";

/** 当前最高价（若无则 null）下，下一笔合法出价的最低金额 */
export function minNextBidAmount(
  project: { startPrice: Decimal; bidStep: Decimal },
  highestBidAmount: Decimal | null,
): Decimal {
  if (highestBidAmount) {
    return new Decimal(highestBidAmount.toString()).plus(project.bidStep.toString());
  }
  return new Decimal(project.startPrice.toString());
}

export function assertBidAtLeastMin(amount: Decimal, minNext: Decimal): void {
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
