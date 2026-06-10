"use server";

import { revalidatePath } from "next/cache";
import { DryingListingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminCanAccessOrg } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

export async function createDryingListingAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "未登录" };
  const assetId = String(formData.get("assetId") ?? "");
  if (!assetId) return { error: "请选择资产" };
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.type !== "DRYING_FIELD") return { error: "请选择晒场类型资产" };
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, asset.orgId);
  if (!ok) return { error: "无权操作" };
  const existing = await prisma.dryingFieldListing.findUnique({ where: { assetId } });
  if (existing) return { error: "该资产已有晒场上架" };
  const maxAdvanceDays = Number(formData.get("maxAdvanceDays") ?? 7);
  const maxPeople = Number(formData.get("maxPeople") ?? 10);
  if (!Number.isInteger(maxAdvanceDays) || maxAdvanceDays < 1 || maxAdvanceDays > 365) {
    return { error: "可预约天数须为 1–365 的整数" };
  }
  if (!Number.isInteger(maxPeople) || maxPeople < 1 || maxPeople > 999) {
    return { error: "每日容量须为 1–999 的整数" };
  }
  await prisma.dryingFieldListing.create({
    data: {
      assetId,
      status: "OPERATING",
      capacityRules: { create: { startDate: new Date("2026-01-01"), endDate: new Date("2027-12-31"), maxPeople } },
      bookingRules: { create: { maxAdvanceDays } },
    },
  });
  await writeAudit(admin.id, "ORG_CREATE", JSON.stringify({ assetId, action: "drying_listing_create" }));
  revalidatePath("/admin/drying");
  return { ok: true as const };
}

export async function toggleDryingListingStatusAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "未登录" };
  const listingId = String(formData.get("listingId") ?? "");
  const newStatus = String(formData.get("status") ?? "");
  const listing = await prisma.dryingFieldListing.findUnique({ where: { id: listingId }, include: { asset: true } });
  if (!listing) return { error: "不存在" };
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, listing.asset.orgId);
  if (!ok) return { error: "无权操作" };
  const allowed: DryingListingStatus[] = ["OPERATING", "MAINTENANCE", "PAUSED", "OFFLINE"];
  if (!allowed.includes(newStatus as DryingListingStatus)) return { error: "无效状态" };
  await prisma.dryingFieldListing.update({
    where: { id: listingId },
    data: { status: newStatus as DryingListingStatus },
  });
  await writeAudit(admin.id, "ORG_UPDATE", JSON.stringify({ listingId, status: newStatus }));
  revalidatePath("/admin/drying");
  return { ok: true as const };
}
