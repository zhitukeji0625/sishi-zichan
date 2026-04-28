import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { orgFilterForAdmin } from "@/lib/admin-scope";
import { Plus, Package } from "lucide-react";
import { getDictMap } from "@/lib/dict";
import { parseAssetImageUrls } from "@/lib/asset-images";

export default async function AdminAssetsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const orgWhere = await orgFilterForAdmin(admin.role, admin.orgId);
  const assets = await prisma.asset.findMany({
    where: orgWhere,
    include: { org: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const typeMap = await getDictMap("asset_type");
  const statusMap = await getDictMap("asset_status");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">资产</h1>
        <Link
          href="/admin/assets/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          <Plus className="h-4 w-4" aria-hidden />
          录入资产
        </Link>
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">图片</th>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">组织</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3"><Link href={`/admin/assets/${a.id}`} className="text-blue-700 hover:underline">{a.name}</Link></td>
                <td className="px-4 py-3">
                  {(() => {
                    const imgs = parseAssetImageUrls(a.imagesJson);
                    return imgs.length > 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 缩略图为 JSON 中的动态 URL
                      <img src={imgs[0]} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                        <Package className="h-4 w-4" />
                      </div>
                    );
                  })()}
                </td>
                <td className="px-4 py-3 text-slate-600">{typeMap[a.type] ?? a.type}</td>
                <td className="px-4 py-3 text-slate-600">{a.org.name}</td>
                <td className="px-4 py-3 text-slate-600">{statusMap[a.status] ?? a.status}</td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  暂无资产
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
