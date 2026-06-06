"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminCanAccessOrg } from "@/lib/rbac";
import { notifyUser } from "@/lib/messages";
import { writeAudit } from "@/lib/audit";

export async function reviewRegistrationFormAction(formData: FormData) {
  const registrationId = String(formData.get("id") ?? "");
  const approve = formData.get("approve") === "true";
  const rejectReason = String(formData.get("rejectReason") ?? "未通过");
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "未登录" };
  if (admin.role !== "COMPANY_ADMIN") return { error: "无权限" };
  const reg = await prisma.auctionRegistration.findUnique({
    where: { id: registrationId },
    include: { project: { include: { asset: true } }, endUser: true },
  });
  if (!reg) return { error: "记录不存在" };
  if (reg.status !== "PENDING") return { error: "该报名已处理，不可重复审核" };
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, reg.project.asset.orgId);
  if (!ok) return { error: "无权操作该组织" };
  await prisma.auctionRegistration.update({
    where: { id: registrationId },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      rejectReason: approve ? null : rejectReason,
    },
  });
  await writeAudit(admin.id, "REGISTRATION_REVIEW", JSON.stringify({ registrationId, approve }));
  await notifyUser(
    reg.endUserId,
    "报名审核结果",
    approve ? "您的竞拍报名已通过，请缴纳保证金。" : `报名未通过：${rejectReason}`,
    "REG_RESULT",
  );
  revalidatePath("/admin/registrations");
  return { ok: true as const };
}
