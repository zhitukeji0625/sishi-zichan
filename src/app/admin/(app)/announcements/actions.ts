"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminCanAccessOrg, isDivision, isRegimentOrAbove } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  orgId: z.string(),
  title: z.string().min(1),
  content: z.string().min(1),
});

export async function createAnnouncementAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "未登录" };
  if (!isRegimentOrAbove(admin.role)) return { error: "无权发布公告草稿" };
  const raw = Object.fromEntries(formData.entries());
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { error: "表单无效" };
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, parsed.data.orgId);
  if (!ok) return { error: "无权" };
  await prisma.announcement.create({
    data: {
      orgId: parsed.data.orgId,
      title: parsed.data.title,
      content: parsed.data.content,
      status: isDivision(admin.role) ? "PUBLISHED" : "PENDING_REVIEW",
      publishedAt: isDivision(admin.role) ? new Date() : null,
    },
  });
  await writeAudit(admin.id, "ANNOUNCEMENT_CREATE", JSON.stringify({ title: parsed.data.title }));
  revalidatePath("/admin/announcements");
  return { ok: true as const };
}

export async function reviewAnnouncementFormAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const approve = formData.get("approve") === "true";
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) throw new Error("无权操作");
  const ann = await prisma.announcement.findUnique({ where: { id } });
  if (!ann) throw new Error("公告不存在");
  if (ann.status !== "PENDING_REVIEW") throw new Error("当前状态不可审核");
  const canAccess = await adminCanAccessOrg(admin.role, admin.orgId, ann.orgId);
  if (!canAccess) throw new Error("无权操作该公告");
  await prisma.announcement.update({
    where: { id },
    data: {
      status: approve ? "PUBLISHED" : "DRAFT",
      publishedAt: approve ? new Date() : null,
      rejectReason: approve ? null : "已驳回",
    },
  });
  await writeAudit(admin.id, "ANNOUNCEMENT_REVIEW", JSON.stringify({ id, approve }));
  revalidatePath("/admin/announcements");
}

export async function deleteAnnouncementAction(id: string) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "未登录" };
  if (!isRegimentOrAbove(admin.role)) return { error: "无权操作" };
  const ann = await prisma.announcement.findUnique({ where: { id } });
  if (!ann) return { error: "公告不存在" };
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, ann.orgId);
  if (!ok) return { error: "无权操作" };
  await prisma.announcement.delete({ where: { id } });
  await writeAudit(admin.id, "ANNOUNCEMENT_CREATE", JSON.stringify({ id, title: ann.title, action: "delete" }));
  revalidatePath("/admin/announcements");
  return { ok: true as const };
}
