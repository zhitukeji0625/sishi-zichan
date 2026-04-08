import { Decimal } from "@prisma/client/runtime/library";

export type BidStepProject = {
  startPrice: Decimal | string | number | { toString(): string };
  bidStep: Decimal | string | number | { toString(): string };
};

export type TopBid = { amount: Decimal | string | number | { toString(): string } } | null;

/** 当前轮次允许的最低出价（无历史出价时为起拍价，否则为最高价 + 加价幅度） */
export function minRequiredBid(project: BidStepProject, top: TopBid): Decimal {
  const step = new Decimal(project.bidStep.toString());
  const start = new Decimal(project.startPrice.toString());
  if (!top) return start;
  return new Decimal(top.amount.toString()).plus(step);
}
