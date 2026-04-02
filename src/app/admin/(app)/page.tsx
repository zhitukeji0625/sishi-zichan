import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { orgFilterForAdmin } from "@/lib/admin-scope";
import { Package, Gavel, Sun } from "lucide-react";

export default async function AdminDashboard() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const orgWhere = await orgFilterForAdmin(admin.role, admin.orgId);

  const [assetCount, auctionLive, dryingPending] = await Promise.all([
    prisma.asset.count({ where: orgWhere }),
    prisma.auctionProject.count({
      where: { status: "LIVE", asset: orgWhere },
    }),
    prisma.dryingReservation.count({
      where: {
        status: "PENDING_REVIEW",
        listing: { asset: orgWhere },
      },
    }),
  ]);

  const cards = [
    { label: "资产数量", value: assetCount, icon: Package },
    { label: "进行中竞拍", value: auctionLive, icon: Gavel },
    { label: "待审核晒场预约", value: dryingPending, icon: Sun },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">工作台</h1>
      <p className="mt-1 text-sm text-slate-500">数据范围已按您的组织权限过滤。</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <c.icon className="h-8 w-8 text-blue-700" aria-hidden />
            <div>
              <div className="text-2xl font-semibold text-slate-900">{c.value}</div>
              <div className="text-sm text-slate-500">{c.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
