"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { isDivision } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

export async function createDictCategoryAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) return { error: "仅师级管理员可操作" };
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!code || !name) return { error: "代码和名称必填" };
  const exists = await prisma.dictCategory.findUnique({ where: { code } });
  if (exists) return { error: "代码已存在" };
  await prisma.dictCategory.create({
    data: { code, name, description: description || null, builtIn: false },
  });
  await writeAudit(admin.id, "CONFIG_UPDATE", JSON.stringify({ action: "dict_category_create", code, name }));
  revalidatePath("/admin/dict");
  return { ok: true as const };
}

export async function createDictItemAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) return { error: "仅师级管理员可操作" };
  const categoryId = String(formData.get("categoryId") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  if (!categoryId || !value || !label) return { error: "值和显示名称必填" };
  const exists = await prisma.dictItem.findUnique({
    where: { categoryId_value: { categoryId, value } },
  });
  if (exists) return { error: "该值已存在" };
  await prisma.dictItem.create({
    data: { categoryId, value, label, sortOrder },
  });
  await writeAudit(admin.id, "CONFIG_UPDATE", JSON.stringify({ action: "dict_item_create", categoryId, value, label }));
  revalidatePath("/admin/dict");
  return { ok: true as const };
}

export async function updateDictItemAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) return { error: "仅师级管理员可操作" };
  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  const enabled = formData.get("enabled") === "true";
  if (!id || !label) return { error: "参数无效" };
  const item = await prisma.dictItem.findUnique({
    where: { id },
    include: { category: { select: { builtIn: true } } },
  });
  if (!item) return { error: "不存在" };
  if (item.category.builtIn && !enabled) return { error: "内置字典项不可禁用" };
  await prisma.dictItem.update({
    where: { id },
    data: { label, sortOrder, enabled },
  });
  await writeAudit(admin.id, "CONFIG_UPDATE", JSON.stringify({ action: "dict_item_update", id, label }));
  revalidatePath("/admin/dict");
  return { ok: true as const };
}

export async function deleteDictItemAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) return { error: "仅师级管理员可操作" };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "参数无效" };
  const item = await prisma.dictItem.findUnique({
    where: { id },
    include: { category: { select: { builtIn: true } } },
  });
  if (!item) return { error: "不存在" };
  if (item.category.builtIn) return { error: "内置字典项不可删除" };
  await prisma.dictItem.delete({ where: { id } });
  await writeAudit(admin.id, "CONFIG_UPDATE", JSON.stringify({ action: "dict_item_delete", id, value: item.value }));
  revalidatePath("/admin/dict");
  return { ok: true as const };
}

export async function deleteDictCategoryAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) return { error: "仅师级管理员可操作" };
  const id = String(formData.get("id") ?? "");
  const cat = await prisma.dictCategory.findUnique({ where: { id } });
  if (!cat) return { error: "不存在" };
  if (cat.builtIn) return { error: "内置字典不可删除" };
  await prisma.dictCategory.delete({ where: { id } });
  await writeAudit(admin.id, "CONFIG_UPDATE", JSON.stringify({ action: "dict_category_delete", code: cat.code }));
  revalidatePath("/admin/dict");
  return { ok: true as const };
}
