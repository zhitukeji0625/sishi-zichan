"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { isDivision } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { OrgLevel } from "@prisma/client";

const createSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  level: z.nativeEnum(OrgLevel),
  parentId: z.string().optional(),
  leaderName: z.string().optional(),
  phone: z.string().optional(),
});

export async function createOrgAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) return { error: "仅师级管理员可操作" };
  const raw = Object.fromEntries(formData.entries());
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { error: "表单数据无效" };
  const d = parsed.data;
  const exists = await prisma.organization.findUnique({ where: { code: d.code } });
  if (exists) return { error: "组织代码已存在" };
  if (d.level === "DIVISION" && d.parentId) return { error: "师级组织不能有上级" };
  if (d.level !== "DIVISION" && !d.parentId) return { error: "团/连级组织必须指定上级" };
  if (d.parentId) {
    const parent = await prisma.organization.findUnique({ where: { id: d.parentId } });
    if (!parent) return { error: "上级组织不存在" };
    if (d.level === "REGIMENT" && parent.level !== "DIVISION") return { error: "团级组织的上级必须是师级" };
    if (d.level === "COMPANY" && parent.level !== "REGIMENT") return { error: "连级组织的上级必须是团级" };
  }
  await prisma.organization.create({
    data: {
      name: d.name,
      code: d.code,
      level: d.level,
      parentId: d.parentId || null,
      leaderName: d.leaderName || null,
      phone: d.phone || null,
    },
  });
  await writeAudit(admin.id, "ORG_CREATE", JSON.stringify({ name: d.name, code: d.code }));
  revalidatePath("/admin/organizations");
  return { ok: true as const };
}

export async function updateOrgAction(orgId: string, formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) return { error: "仅师级管理员可操作" };
  const name = String(formData.get("name") ?? "");
  const leaderName = String(formData.get("leaderName") ?? "");
  const phone = String(formData.get("phone") ?? "");
  if (!name) return { error: "名称不能为空" };
  await prisma.organization.update({
    where: { id: orgId },
    data: { name, leaderName: leaderName || null, phone: phone || null },
  });
  await writeAudit(admin.id, "ORG_UPDATE", JSON.stringify({ orgId, name }));
  revalidatePath("/admin/organizations");
  return { ok: true as const };
}
