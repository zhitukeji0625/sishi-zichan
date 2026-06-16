import { NextResponse } from "next/server";
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
  imagesJson: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ error: "资产不存在" }, { status: 404 });
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, asset.orgId);
  if (!ok) return NextResponse.json({ error: "无权操作" }, { status: 403 });
  const formData = await req.formData();
  const raw = Object.fromEntries(formData.entries());
  const parsed = updateSchema.safeParse({
    ...raw,
    refPriceMin: raw.refPriceMin !== undefined && raw.refPriceMin !== "" ? Number(raw.refPriceMin) : undefined,
    refPriceMax: raw.refPriceMax !== undefined && raw.refPriceMax !== "" ? Number(raw.refPriceMax) : undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  const d = parsed.data;
  await prisma.asset.update({
    where: { id },
    data: {
      name: d.name,
      locationText: d.locationText,
      specs: d.specs || null,
      description: d.description || null,
      refPriceMin: d.refPriceMin ?? null,
      refPriceMax: d.refPriceMax ?? null,
      status: d.status,
      imagesJson: d.imagesJson || null,
    },
  });
  await writeAudit(admin.id, "ASSET_UPDATE", JSON.stringify({ assetId: id, name: d.name }));
  return NextResponse.json({ ok: true });
}
