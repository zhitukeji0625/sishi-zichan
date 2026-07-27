import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/** 路由参数可能是项目 id 或对外编号 code（如 AP…） */
export async function resolveAuctionProject(
  idOrCode: string,
  include?: Prisma.AuctionProjectInclude,
) {
  if (include) {
    const byId = await prisma.auctionProject.findUnique({
      where: { id: idOrCode },
      include,
    });
    if (byId) return byId;
    return prisma.auctionProject.findUnique({
      where: { code: idOrCode },
      include,
    });
  }
  const byId = await prisma.auctionProject.findUnique({ where: { id: idOrCode } });
  if (byId) return byId;
  return prisma.auctionProject.findUnique({ where: { code: idOrCode } });
}

export async function resolveAuctionProjectId(idOrCode: string): Promise<string | null> {
  const byId = await prisma.auctionProject.findUnique({
    where: { id: idOrCode },
    select: { id: true },
  });
  if (byId) return byId.id;
  const byCode = await prisma.auctionProject.findUnique({
    where: { code: idOrCode },
    select: { id: true },
  });
  return byCode?.id ?? null;
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
  const { endUserId, amount } = params;
  const resolvedId = await resolveAuctionProjectId(params.projectId);
  if (!resolvedId) throw new Error("项目不存在");
  const projectId = resolvedId;
  return prisma.$transaction(async (tx) => {
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
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
