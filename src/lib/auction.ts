import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/** 可单元测试的出价校验（不依赖数据库）。 */
export function assertPlaceBidAllowed(params: {
  project: { status: string; startPrice: Decimal; bidStep: Decimal } | null;
  registration: { status: string; depositPaid: boolean } | null;
  topBidAmount: Decimal | null;
  amount: Decimal;
}): void {
  const { project, registration, topBidAmount, amount } = params;
  if (!project || project.status !== "LIVE") {
    throw new Error("竞拍未在进行中");
  }
  if (!registration || registration.status !== "APPROVED" || !registration.depositPaid) {
    throw new Error("无出价资格，请完成报名与保证金");
  }
  const minNext = topBidAmount
    ? new Decimal(topBidAmount.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
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
    const reg = await tx.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId, endUserId } },
    });
    const top = await tx.auctionBid.findFirst({
      where: { projectId },
      orderBy: { amount: "desc" },
    });
    assertPlaceBidAllowed({
      project: project
        ? {
            status: project.status,
            startPrice: new Decimal(project.startPrice.toString()),
            bidStep: new Decimal(project.bidStep.toString()),
          }
        : null,
      registration: reg
        ? { status: reg.status, depositPaid: reg.depositPaid }
        : null,
      topBidAmount: top ? new Decimal(top.amount.toString()) : null,
      amount,
    });
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
