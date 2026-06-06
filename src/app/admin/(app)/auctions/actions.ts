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
  const startsAt = new Date(d.startsAt);
  const endsAt = new Date(d.endsAt);
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
    return { error: "日期格式无效" };
  }
  if (endsAt <= startsAt) {
    return { error: "结束时间须晚于开始时间" };
  }
  const code = `AP${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await prisma.auctionProject.create({
    data: {
      code,
      assetId: d.assetId,
      startPrice: new Decimal(d.startPrice),
      bidStep: new Decimal(d.bidStep),
      depositAmount: new Decimal(d.depositAmount),
      startsAt,
      endsAt,
      paymentDays: d.paymentDays ?? 7,
      leaseTermDesc: d.leaseTermDesc || null,
      status: "SCHEDULED",
    },
  });
  await writeAudit(admin.id, "AUCTION_CREATE", JSON.stringify({ code, assetId: d.assetId }));
  revalidatePath("/admin/auctions");
  return { ok: true as const };
}

export async function cancelAuctionAction(projectId: string) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "未登录" };
  if (!isRegimentOrAbove(admin.role)) return { error: "无权操作" };
  const project = await prisma.auctionProject.findUnique({ where: { id: projectId }, include: { asset: true } });
  if (!project) return { error: "项目不存在" };
  const ok = await adminCanAccessOrg(admin.role, admin.orgId, project.asset.orgId);
  if (!ok) return { error: "无权操作" };
  if (project.status === "ENDED") return { error: "已结束的项目不可取消" };
  await prisma.auctionProject.update({ where: { id: projectId }, data: { status: "CANCELLED" } });
  await writeAudit(admin.id, "AUCTION_CREATE", JSON.stringify({ projectId, action: "cancel" }));
  revalidatePath("/admin/auctions");
  return { ok: true as const };
}
