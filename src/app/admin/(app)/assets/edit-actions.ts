"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminCanAccessOrg } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { AssetStatus } from "@prisma/client";

const updateSchema = z.object({
  name: z.string().min(1),
  locationText: z.string().min(1),
  specs: z.string().optional(),
  description: z.string().optional(),
  refPriceMin: z.coerce.number().optional(),
  refPriceMax: z.coerce.number().optional(),
  status: z.nativeEnum(AssetStatus),
});

export async function updateAssetAction(assetId: string, formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "未登录" };
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return { error: "资产不存在" };
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, asset.orgId);
  if (!ok) return { error: "无权操作" };
  const raw = Object.fromEntries(formData.entries());
  const parsed = updateSchema.safeParse({
    ...raw,
    refPriceMin: raw.refPriceMin ? Number(raw.refPriceMin) : undefined,
    refPriceMax: raw.refPriceMax ? Number(raw.refPriceMax) : undefined,
  });
  if (!parsed.success) return { error: "表单数据无效" };
  const d = parsed.data;
  await prisma.asset.update({
    where: { id: assetId },
    data: {
      name: d.name,
      locationText: d.locationText,
      specs: d.specs || null,
      description: d.description || null,
      refPriceMin: d.refPriceMin ?? null,
      refPriceMax: d.refPriceMax ?? null,
      status: d.status,
    },
  });
  await writeAudit(admin.id, "ASSET_UPDATE", JSON.stringify({ assetId, name: d.name }));
  revalidatePath("/admin/assets");
  return { ok: true as const };
}

export async function deleteAssetAction(assetId: string) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "未登录" };
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { auctionProjects: { take: 1 }, dryingListing: { include: { reservations: { take: 1 } } } },
  });
  if (!asset) return { error: "资产不存在" };
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, asset.orgId);
  if (!ok) return { error: "无权操作" };
  if (asset.auctionProjects.length > 0) return { error: "已关联竞拍项目，不可删除" };
  if (asset.dryingListing && asset.dryingListing.reservations.length > 0) return { error: "已有预约记录，不可删除" };
  await prisma.asset.delete({ where: { id: assetId } });
  await writeAudit(admin.id, "ASSET_DELETE", JSON.stringify({ assetId, name: asset.name }));
  revalidatePath("/admin/assets");
  return { ok: true as const };
}
