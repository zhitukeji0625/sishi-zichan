import { Decimal } from "@prisma/client/runtime/library";
import type {
  AuctionProjectStatus,
  RegistrationStatus,
} from "@prisma/client";

export type PlaceBidContext = {
  projectStatus: AuctionProjectStatus;
  startPrice: Decimal;
  bidStep: Decimal;
  /** 当前最高出价金额，无出价时为 null */
  topBidAmount: Decimal | null;
  registration: {
    status: RegistrationStatus;
    depositPaid: boolean;
  } | null;
};

/**
 * 校验出价金额与资格（不访问数据库，便于单元测试）。
 * @returns 校验通过时返回 undefined；否则抛出与业务一致的 Error。
 */
export function assertBidAllowed(ctx: PlaceBidContext, amount: Decimal): void {
  if (ctx.projectStatus !== "LIVE") {
    throw new Error("竞拍未在进行中");
  }
  const reg = ctx.registration;
  if (!reg || reg.status !== "APPROVED" || !reg.depositPaid) {
    throw new Error("无出价资格，请完成报名与保证金");
  }
  const minNext = ctx.topBidAmount
    ? new Decimal(ctx.topBidAmount.toString()).plus(ctx.bidStep.toString())
    : new Decimal(ctx.startPrice.toString());
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}
