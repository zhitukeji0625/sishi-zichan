"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminCanAccessOrg, organizationExists } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { AssetType, AssetStatus } from "@prisma/client";

const schema = z.object({
  orgId: z.string(),
  type: z.nativeEnum(AssetType),
  name: z.string().min(1),
  locationText: z.string().min(1),
  specs: z.string().optional(),
  description: z.string().optional(),
  refPriceMin: z.coerce.number().optional(),
  refPriceMax: z.coerce.number().optional(),
  status: z.nativeEnum(AssetStatus).optional(),
});

export async function createAssetAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "未登录" };
  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse({
    ...raw,
    refPriceMin: raw.refPriceMin ? Number(raw.refPriceMin) : undefined,
    refPriceMax: raw.refPriceMax ? Number(raw.refPriceMax) : undefined,
  });
  if (!parsed.success) return { error: "表单数据无效" };
  const d = parsed.data;
  if (!(await organizationExists(d.orgId))) {
    return { error: "组织不存在" };
  }
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, d.orgId);
  if (!ok) return { error: "无权在该组织录入资产" };
  await prisma.asset.create({
    data: {
      orgId: d.orgId,
      type: d.type,
      name: d.name,
      locationText: d.locationText,
      specs: d.specs || null,
      description: d.description || null,
      refPriceMin: d.refPriceMin ?? null,
      refPriceMax: d.refPriceMax ?? null,
      status: d.status ?? AssetStatus.IDLE,
    },
  });
  await writeAudit(admin.id, "ASSET_CREATE", JSON.stringify({ name: d.name, type: d.type }));
  revalidatePath("/admin/assets");
  return { ok: true as const };
}
