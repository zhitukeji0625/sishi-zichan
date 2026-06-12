"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { notifyUser } from "@/lib/messages";

export async function registerAuctionAction(projectId: string) {
  const user = await getCurrentEndUser();
  if (!user) return { error: "请先登录" };
  const project = await prisma.auctionProject.findUnique({ where: { id: projectId } });
  if (!project) return { error: "项目不存在" };
  if (project.status !== "SCHEDULED" && project.status !== "LIVE") {
    return { error: "项目当前状态不允许报名" };
  }
  const exists = await prisma.auctionRegistration.findUnique({
    where: { projectId_endUserId: { projectId, endUserId: user.id } },
  });
  if (exists) {
    if (exists.status === "REJECTED") return { error: "报名已被拒绝，无法重新报名" };
    return { ok: true as const };
  }
  try {
    await prisma.auctionRegistration.create({
      data: { projectId, endUserId: user.id, status: "PENDING" },
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { ok: true as const };
    }
    throw e;
  }
  await notifyUser(user.id, "报名已提交", "您的竞拍报名已提交，请等待连队审核。", "REG_SUBMIT");
  revalidatePath(`/m/auction/${projectId}`);
  return { ok: true as const };
}
