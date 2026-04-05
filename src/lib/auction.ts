import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

type AuctionBidProject = {
  status: string;
  startPrice: { toString(): string };
  bidStep: { toString(): string };
};

type AuctionBidRegistration = {
  status: string;
  depositPaid: boolean;
};

/** 校验出价规则（无 I/O，便于单测）。通过则不返回值；不通过则抛出与 placeBid 一致的 Error。 */
export function assertAuctionBidAllowed(params: {
  project: AuctionBidProject | null;
  registration: AuctionBidRegistration | null;
  highestBidAmount: Decimal | null;
  amount: Decimal;
}): void {
  const { project, registration, highestBidAmount, amount } = params;
  if (!project || project.status !== "LIVE") {
    throw new Error("竞拍未在进行中");
  }
  if (!registration || registration.status !== "APPROVED" || !registration.depositPaid) {
    throw new Error("无出价资格，请完成报名与保证金");
  }
  const minNext = highestBidAmount
    ? highestBidAmount.plus(project.bidStep.toString())
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
    const highestBidAmount = top ? new Decimal(top.amount.toString()) : null;
    assertAuctionBidAllowed({
      project,
      registration: reg,
      highestBidAmount,
      amount,
    });
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
