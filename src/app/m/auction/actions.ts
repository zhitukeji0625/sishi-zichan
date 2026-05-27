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
  if (exists) return { ok: true as const };
  try {
    await prisma.auctionRegistration.create({
      data: { projectId, endUserId: user.id, status: "PENDING" },
    });
  } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return { ok: true as const };
    }
    throw e;
  }
  await notifyUser(user.id, "报名已提交", "您的竞拍报名已提交，请等待连队审核。", "REG_SUBMIT");
  revalidatePath(`/m/auction/${projectId}`);
  return { ok: true as const };
}
