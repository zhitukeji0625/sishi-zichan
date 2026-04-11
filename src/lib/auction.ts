import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { assertCanPlaceBid } from "@/lib/auction-rules";

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
    assertCanPlaceBid({
      project: project
        ? {
            status: project.status,
            startPrice: project.startPrice.toString(),
            bidStep: project.bidStep.toString(),
          }
        : null,
      registration: reg
        ? { status: reg.status, depositPaid: reg.depositPaid }
        : null,
      topBidAmount: top ? top.amount.toString() : null,
      amount,
    });
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
