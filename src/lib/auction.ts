import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

type Moneyish = { toString(): string };

/** 供单元测试与 placeBid 共用的最低可接受出价（含首拍起价与加价步长规则） */
export function getMinimumNextBidAmount(
  project: { startPrice: Moneyish; bidStep: Moneyish },
  topBid: { amount: Moneyish } | null,
): Decimal {
  const startPrice = new Decimal(project.startPrice.toString());
  const bidStep = new Decimal(project.bidStep.toString());
  if (!topBid) return startPrice;
  return new Decimal(topBid.amount.toString()).plus(bidStep);
}

export function assertAuctionProjectLive(
  project: { status: string } | null | undefined,
): asserts project is { status: string; startPrice: Moneyish; bidStep: Moneyish } {
  if (!project || project.status !== "LIVE") {
    throw new Error("竞拍未在进行中");
  }
}

export function assertRegistrationEligible(
  reg: { status: string; depositPaid: boolean } | null | undefined,
): asserts reg is { status: string; depositPaid: boolean } {
  if (!reg || reg.status !== "APPROVED" || !reg.depositPaid) {
    throw new Error("无出价资格，请完成报名与保证金");
  }
}

export function assertBidAmountAtLeast(amount: Decimal, minNext: Decimal): void {
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
}

export async function getHighestBid(projectId: string) {
  const top = await prisma.auctionBid.findFirst({
    where: { projectId },
    orderBy: { amount: "desc" },
  });
  return top?.amount ?? null;
}

export async function placeBid(params: {
  projectId: string;
  endUserId: string;
  amount: Decimal;
}) {
  const { projectId, endUserId, amount } = params;
  return prisma.$transaction(async (tx) => {
    const project = await tx.auctionProject.findUnique({ where: { id: projectId } });
    assertAuctionProjectLive(project);
    const reg = await tx.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId, endUserId } },
    });
    assertRegistrationEligible(reg);
    const top = await tx.auctionBid.findFirst({
      where: { projectId },
      orderBy: { amount: "desc" },
    });
    const minNext = getMinimumNextBidAmount(project, top);
    assertBidAmountAtLeast(amount, minNext);
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
