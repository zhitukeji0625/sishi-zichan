import { Decimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** 路由参数可为 cuid 或项目编号 code（如 AP…） */
export async function findAuctionProjectBySlug(
  slug: string,
  include?: Prisma.AuctionProjectInclude,
) {
  if (include) {
    const byId = await prisma.auctionProject.findUnique({ where: { id: slug }, include });
    if (byId) return byId;
    return prisma.auctionProject.findUnique({ where: { code: slug }, include });
  }
  const byId = await prisma.auctionProject.findUnique({ where: { id: slug } });
  if (byId) return byId;
  return prisma.auctionProject.findUnique({ where: { code: slug } });
}

export async function resolveAuctionProjectId(slug: string): Promise<string | null> {
  const project = await findAuctionProjectBySlug(slug);
  return project?.id ?? null;
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
  const resolvedId = await resolveAuctionProjectId(projectId);
  if (!resolvedId) throw new Error("竞拍项目不存在");
  return prisma.$transaction(async (tx) => {
    const project = await tx.auctionProject.findUnique({ where: { id: resolvedId } });
    if (!project || project.status !== "LIVE") {
      throw new Error("竞拍未在进行中");
    }
    const reg = await tx.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId: resolvedId, endUserId } },
    });
    if (!reg || reg.status !== "APPROVED" || !reg.depositPaid) {
      throw new Error("无出价资格，请完成报名与保证金");
    }
    const top = await tx.auctionBid.findFirst({
      where: { projectId: resolvedId },
      orderBy: { amount: "desc" },
    });
    const minNext = top
      ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
      : new Decimal(project.startPrice.toString());
    if (amount.lessThan(minNext)) {
      throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
    }
    const bid = await tx.auctionBid.create({
      data: { projectId: resolvedId, endUserId, amount },
    });
    return bid;
  });
}
