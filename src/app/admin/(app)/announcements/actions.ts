"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminCanAccessOrg, isDivision, isRegimentOrAbove } from "@/lib/rbac";

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
  revalidatePath("/admin/announcements");
  return { ok: true as const };
}

export async function reviewAnnouncementFormAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const approve = formData.get("approve") === "true";
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) return;
  const ann = await prisma.announcement.findUnique({ where: { id } });
  if (!ann || ann.status !== "PENDING_REVIEW") return;
  await prisma.announcement.update({
    where: { id },
    data: {
      status: approve ? "PUBLISHED" : "DRAFT",
      publishedAt: approve ? new Date() : null,
      rejectReason: approve ? null : "已驳回",
    },
  });
  revalidatePath("/admin/announcements");
}
