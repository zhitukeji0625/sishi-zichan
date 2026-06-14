import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminCanAccessOrg } from "@/lib/rbac";
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
  imagesJson: z.string().optional(),
});

function isFormBody(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  return ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded");
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isFormBody(req)) {
    return NextResponse.json({ error: "请使用 multipart/form-data 提交" }, { status: 400 });
  }
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
}
