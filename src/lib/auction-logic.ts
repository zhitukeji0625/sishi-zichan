import { Decimal } from "@prisma/client/runtime/library";

export function validatePlaceBidPrerequisites(
  project: { status: string } | null,
  registration: { status: string; depositPaid: boolean } | null,
): void {
  if (!project || project.status !== "LIVE") {
    throw new Error("竞拍未在进行中");
  }
  if (!registration || registration.status !== "APPROVED" || !registration.depositPaid) {
    throw new Error("无出价资格，请完成报名与保证金");
  }
}

export function computeMinNextBidAmount(
  startPrice: Decimal | string | number,
  bidStep: Decimal | string | number,
  topAmount: Decimal | string | number | null | undefined,
): Decimal {
  const step = new Decimal(bidStep.toString());
  if (topAmount == null) {
    return new Decimal(startPrice.toString());
  }
  return new Decimal(topAmount.toString()).plus(step);
}

export function assertBidAmountAtLeastMin(amount: Decimal, minNext: Decimal): void {
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
