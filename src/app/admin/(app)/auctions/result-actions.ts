"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { isDivision, isRegimentOrAbove, adminCanAccessOrg } from "@/lib/rbac";
import { notifyUser } from "@/lib/messages";
import { writeAudit } from "@/lib/audit";

export async function generateAuctionResultAction(projectId: string) {
  const admin = await getCurrentAdmin();
  if (!admin || !isRegimentOrAbove(admin.role)) {
    return { error: "无权操作" };
  }
  const project = await prisma.auctionProject.findUnique({
    where: { id: projectId },
    include: { asset: true, result: true },
  });
  if (!project) return { error: "项目不存在" };
  if (project.status !== "ENDED") return { error: "竞拍尚未结束" };
  if (project.result) return { error: "已生成结果" };
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, project.asset.orgId);
  if (!ok) return { error: "无权操作该项目" };
  const topBid = await prisma.auctionBid.findFirst({
    where: { projectId },
    orderBy: { amount: "desc" },
  });
  await prisma.auctionResult.create({
    data: {
      projectId,
      winnerId: topBid?.endUserId ?? null,
      status: "PENDING_REVIEW",
    },
  });
  await writeAudit(admin.id, "AUCTION_RESULT_GENERATE", JSON.stringify({ projectId }));
  revalidatePath("/admin/auctions");
  return { ok: true as const };
}

export async function reviewAuctionResultAction(formData: FormData) {
  const resultId = String(formData.get("id") ?? "");
  const approve = formData.get("approve") === "true";
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) return;
  const result = await prisma.auctionResult.findUnique({
    where: { id: resultId },
    include: { project: { include: { asset: true } } },
  });
  if (!result || result.status !== "PENDING_REVIEW") return;
  const canAccess = await adminCanAccessOrg(admin.role, admin.orgId, result.project.asset.orgId);
  if (!canAccess) return;
  if (approve) {
    await prisma.auctionResult.update({
      where: { id: resultId },
      data: { status: "PUBLISHED", publishedAt: new Date(), reviewedBy: admin.id },
    });
    if (result.winnerId) {
      await notifyUser(
        result.winnerId,
        "竞拍中标通知",
        `恭喜您在项目 ${result.project.code} 中竞拍成功，请前往签署合同并支付租金。`,
        "AUCTION_WIN",
      );
    }
    // Refund non-winner deposits only when there is a winner
    const allRegs = result.winnerId
      ? await prisma.auctionRegistration.findMany({
          where: {
            projectId: result.projectId,
            depositPaid: true,
            endUserId: { not: result.winnerId },
          },
        })
      : [];
    for (const reg of allRegs) {
      const existingRefund = await prisma.payment.findFirst({
        where: { auctionProjectId: result.projectId, endUserId: reg.endUserId, purpose: "AUCTION_DEPOSIT", status: "REFUNDED" },
      });
      if (!existingRefund) {
        await prisma.payment.updateMany({
          where: { auctionProjectId: result.projectId, endUserId: reg.endUserId, purpose: "AUCTION_DEPOSIT", status: "SUCCESS" },
          data: { status: "REFUNDED" },
        });
        await notifyUser(reg.endUserId, "保证金退还通知", `项目 ${result.project.code} 的竞拍保证金已原路退回。`, "DEPOSIT_REFUND");
      }
    }
  } else {
    await prisma.auctionResult.update({
      where: { id: resultId },
      data: { status: "REJECTED", reviewedBy: admin.id },
    });
  }
  await writeAudit(admin.id, "AUCTION_RESULT_REVIEW", JSON.stringify({ resultId, approve }));
  revalidatePath("/admin/auctions");
}
