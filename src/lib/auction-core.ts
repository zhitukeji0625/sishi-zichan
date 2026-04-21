import { Decimal } from "@prisma/client/runtime/library";

export function computeMinNextBid(input: {
  startPrice: Decimal;
  bidStep: Decimal;
  highestAmount: Decimal | null;
}): Decimal {
  const { startPrice, bidStep, highestAmount } = input;
  return highestAmount
    ? new Decimal(highestAmount.toString()).plus(bidStep.toString())
    : new Decimal(startPrice.toString());
}

export function assertLiveProject<T extends { status: string }>(
  project: T | null,
): asserts project is T {
  if (!project || project.status !== "LIVE") {
    throw new Error("竞拍未在进行中");
  }
}

export function assertRegistrationAllowsBid(
  reg: { status: string; depositPaid: boolean } | null,
): void {
  if (!reg || reg.status !== "APPROVED" || !reg.depositPaid) {
    throw new Error("无出价资格，请完成报名与保证金");
  }
}

export function assertAmountMeetsMin(amount: Decimal, minNext: Decimal): void {
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
