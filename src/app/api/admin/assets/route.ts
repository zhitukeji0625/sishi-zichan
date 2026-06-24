import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminCanAccessOrg } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { prismaErrorMessage } from "@/lib/prisma-errors";
import { AssetType, AssetStatus } from "@prisma/client";

const schema = z.object({
  orgId: z.string().min(1, "请选择组织"),
  type: z.nativeEnum(AssetType),
  name: z.string().min(1),
  locationText: z.string().min(1),
  specs: z.string().optional(),
  description: z.string().optional(),
  refPriceMin: z.coerce.number().optional(),
  refPriceMax: z.coerce.number().optional(),
  status: z.nativeEnum(AssetStatus).optional(),
  imagesJson: z.string().optional(),
});

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const formData = await req.formData();
  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse({
    ...raw,
    refPriceMin: raw.refPriceMin ? Number(raw.refPriceMin) : undefined,
    refPriceMax: raw.refPriceMax ? Number(raw.refPriceMax) : undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "表单数据无效" }, { status: 400 });
  const d = parsed.data;
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, d.orgId);
  if (!ok) return NextResponse.json({ error: "无权在该组织录入资产" }, { status: 403 });
  const org = await prisma.organization.findUnique({ where: { id: d.orgId }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "组织不存在" }, { status: 400 });
  try {
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
        imagesJson: d.imagesJson || null,
      },
    });
    await writeAudit(admin.id, "ASSET_CREATE", JSON.stringify({ name: d.name, type: d.type }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = prismaErrorMessage(e);
    if (msg) return NextResponse.json({ error: msg }, { status: 400 });
    throw e;
  }
}
