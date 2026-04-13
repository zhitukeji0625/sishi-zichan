"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { isDivision, adminCanAccessOrg } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { AdminRole } from "@prisma/client";

const createSchema = z.object({
  phone: z.string().min(11).max(15),
  password: z.string().min(6).max(64),
  name: z.string().min(1),
  role: z.nativeEnum(AdminRole),
  orgId: z.string(),
});

export async function createAdminAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) return { error: "仅师级管理员可操作" };
  const raw = Object.fromEntries(formData.entries());
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { error: "表单数据无效" };
  const d = parsed.data;
  const canTargetOrg = await adminCanAccessOrg(admin.role, admin.orgId, d.orgId);
  if (!canTargetOrg) return { error: "无权在该组织下创建管理员" };
  const exists = await prisma.adminUser.findUnique({ where: { phone: d.phone } });
  if (exists) return { error: "手机号已存在" };
  const passwordHash = await hashPassword(d.password);
  await prisma.adminUser.create({
    data: { phone: d.phone, passwordHash, name: d.name, role: d.role, orgId: d.orgId },
  });
  await writeAudit(admin.id, "ADMIN_CREATE", JSON.stringify({ phone: d.phone, name: d.name, role: d.role }));
  revalidatePath("/admin/admins");
  return { ok: true as const };
}

export async function toggleAdminDisableAction(formData: FormData) {
  const targetId = String(formData.get("id") ?? "");
  const disable = formData.get("disable") === "true";
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) return;
  const target = await prisma.adminUser.findUnique({ where: { id: targetId } });
  if (!target || target.id === admin.id) return;
  const canTarget = await adminCanAccessOrg(admin.role, admin.orgId, target.orgId);
  if (!canTarget) return;
  await prisma.adminUser.update({
    where: { id: targetId },
    data: { disabled: disable },
  });
  await writeAudit(admin.id, "ADMIN_DISABLE", JSON.stringify({ targetId, phone: target.phone, disabled: disable }));
  revalidatePath("/admin/admins");
}
