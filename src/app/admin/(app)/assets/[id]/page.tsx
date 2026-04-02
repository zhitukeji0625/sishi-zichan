import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminCanAccessOrg } from "@/lib/rbac";
import { AssetStatus } from "@prisma/client";
import { updateAssetAction, deleteAssetAction } from "../edit-actions";
import Link from "next/link";

export default async function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  const asset = await prisma.asset.findUnique({ where: { id }, include: { org: true } });
  if (!asset) notFound();
  const canAccess = await adminCanAccessOrg(admin.role, admin.orgId, asset.orgId);
  if (!canAccess) notFound();
  const assetId = asset.id;

  async function handleUpdate(fd: FormData) {
    "use server";
    const r = await updateAssetAction(assetId, fd);
    if (r.error) redirect(`/admin/assets/${assetId}?error=${encodeURIComponent(r.error)}`);
    redirect("/admin/assets");
  }

  async function handleDelete() {
    "use server";
    const r = await deleteAssetAction(assetId);
    if (r.error) redirect(`/admin/assets/${assetId}?error=${encodeURIComponent(r.error)}`);
    redirect("/admin/assets");
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/admin/assets" className="text-sm text-blue-700">← 返回资产列表</Link>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">编辑资产</h1>
      <p className="mt-1 text-sm text-slate-500">{asset.org.name} · {asset.type}</p>
      <form action={handleUpdate} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">名称</label>
          <input name="name" required defaultValue={asset.name} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">位置</label>
          <input name="locationText" required defaultValue={asset.locationText} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">规格说明</label>
          <textarea name="specs" rows={2} defaultValue={asset.specs ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">详情（富文本 HTML）</label>
          <textarea name="description" rows={4} defaultValue={asset.description ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">参考价下限</label>
            <input name="refPriceMin" type="number" step="0.01" defaultValue={asset.refPriceMin?.toString() ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">参考价上限</label>
            <input name="refPriceMax" type="number" step="0.01" defaultValue={asset.refPriceMax?.toString() ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">状态</label>
          <select name="status" defaultValue={asset.status} className="w-full rounded-lg border border-slate-200 px-3 py-2">
            {Object.values(AssetStatus).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800">
          保存修改
        </button>
      </form>
      <form action={handleDelete} className="mt-4">
        <button type="submit" className="w-full rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50">
          删除资产
        </button>
      </form>
    </div>
  );
}
