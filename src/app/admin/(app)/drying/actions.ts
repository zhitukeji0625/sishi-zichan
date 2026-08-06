"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminCanAccessOrg } from "@/lib/rbac";
import { notifyUser } from "@/lib/messages";
import { writeAudit } from "@/lib/audit";

export async function reviewReservationFormAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const approve = formData.get("approve") === "true";
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "未登录" };
  if (admin.role !== "COMPANY_ADMIN") return { error: "无权限" };
  const res = await prisma.dryingReservation.findUnique({
    where: { id },
    include: { listing: { include: { asset: true } } },
  });
  if (!res || res.status !== "PENDING_REVIEW") return { error: "记录不存在或状态不正确" };
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, res.listing.asset.orgId);
  if (!ok) return { error: "无权操作该组织" };
  await prisma.dryingReservation.update({
    where: { id },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      rejectReason: approve ? null : "未通过审核",
    },
  });
  await writeAudit(admin.id, "DRYING_REVIEW", JSON.stringify({ id, approve }));
  if (res.endUserId) {
    await notifyUser(
      res.endUserId,
      "晒场预约审核",
      approve ? "您的预约已通过，请缴纳保证金。" : "预约未通过。",
      "DRY_REVIEW",
    );
  }
  revalidatePath("/admin/drying");
  return { ok: true as const };
}
