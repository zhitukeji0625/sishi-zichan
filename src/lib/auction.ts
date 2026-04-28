import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

export async function getHighestBid(projectId: string) {
  const top = await prisma.auctionBid.findFirst({
    where: { projectId },
    orderBy: { amount: "desc" },
  });
  return top?.amount ?? null;
}

/** 在已有事务内出价，便于单测注入 mock 客户端。 */
export async function placeBidWithClient(
  tx: Prisma.TransactionClient,
  params: { projectId: string; endUserId: string; amount: Decimal },
) {
  const { projectId, endUserId, amount } = params;
  const project = await tx.auctionProject.findUnique({ where: { id: projectId } });
  if (!project || project.status !== "LIVE") {
    throw new Error("竞拍未在进行中");
  }
  const reg = await tx.auctionRegistration.findUnique({
    where: { projectId_endUserId: { projectId, endUserId } },
  });
  if (!reg || reg.status !== "APPROVED" || !reg.depositPaid) {
    throw new Error("无出价资格，请完成报名与保证金");
  }
  const top = await tx.auctionBid.findFirst({
    where: { projectId },
    orderBy: { amount: "desc" },
  });
  const minNext = top
    ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
  return tx.auctionBid.create({
    data: { projectId, endUserId, amount },
  });
}

export async function placeBid(params: {
  projectId: string;
  endUserId: string;
  amount: Decimal;
}) {
  return prisma.$transaction((tx) => placeBidWithClient(tx, params));
}
