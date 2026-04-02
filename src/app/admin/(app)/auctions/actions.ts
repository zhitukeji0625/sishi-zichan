"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminCanAccessOrg, isRegimentOrAbove } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  assetId: z.string(),
  startPrice: z.coerce.number().positive(),
  bidStep: z.coerce.number().positive(),
  depositAmount: z.coerce.number().positive(),
  startsAt: z.string(),
  endsAt: z.string(),
  paymentDays: z.coerce.number().int().min(1).optional(),
  leaseTermDesc: z.string().optional(),
});

export async function createAuctionProjectAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "未登录" };
  if (!isRegimentOrAbove(admin.role)) {
    return { error: "仅团级及以上可发布竞拍" };
  }
  const raw = Object.fromEntries(formData.entries());
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { error: "表单无效" };
  const d = parsed.data;
  const asset = await prisma.asset.findUnique({ where: { id: d.assetId } });
  if (!asset) return { error: "资产不存在" };
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, asset.orgId);
  if (!ok) return { error: "无权使用该资产发拍" };
  const code = `AP${Date.now()}`;
  await prisma.auctionProject.create({
    data: {
      code,
      assetId: d.assetId,
      startPrice: new Decimal(d.startPrice),
      bidStep: new Decimal(d.bidStep),
      depositAmount: new Decimal(d.depositAmount),
      startsAt: new Date(d.startsAt),
      endsAt: new Date(d.endsAt),
      paymentDays: d.paymentDays ?? 7,
      leaseTermDesc: d.leaseTermDesc || null,
      status: "SCHEDULED",
    },
  });
  await writeAudit(admin.id, "AUCTION_CREATE", JSON.stringify({ code, assetId: d.assetId }));
  revalidatePath("/admin/auctions");
  return { ok: true as const };
}
