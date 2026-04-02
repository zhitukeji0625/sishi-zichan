import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminScopedOrgIds } from "@/lib/rbac";
import { createAssetAction } from "../actions";
import { AssetType, AssetStatus } from "@prisma/client";

export default async function NewAssetPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  const scope = await adminScopedOrgIds(admin.role, admin.orgId);
  const orgIds = scope === "ALL" ? null : scope;
  const orgs = await prisma.organization.findMany({
    where: orgIds ? { id: { in: orgIds } } : {},
    orderBy: { code: "asc" },
  });

  async function action(fd: FormData) {
    "use server";
    const r = await createAssetAction(fd);
    if (r.error) {
      redirect(`/admin/assets/new?error=${encodeURIComponent(r.error)}`);
    }
    redirect("/admin/assets");
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-semibold text-slate-900">录入资产</h1>
      <form action={action} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">所属组织</label>
          <select
            name="orgId"
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
            defaultValue={admin.orgId}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">资产类型</label>
          <select name="type" className="w-full rounded-lg border border-slate-200 px-3 py-2">
            {Object.values(AssetType).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">名称</label>
          <input name="name" required className="w-full rounded-lg border border-slate-200 px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">位置</label>
          <input name="locationText" required className="w-full rounded-lg border border-slate-200 px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">规格说明</label>
          <textarea name="specs" rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">详情（富文本 HTML）</label>
          <textarea name="description" rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">参考价下限</label>
            <input name="refPriceMin" type="number" step="0.01" className="w-full rounded-lg border border-slate-200 px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">参考价上限</label>
            <input name="refPriceMax" type="number" step="0.01" className="w-full rounded-lg border border-slate-200 px-3 py-2" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">状态</label>
          <select name="status" className="w-full rounded-lg border border-slate-200 px-3 py-2">
            {Object.values(AssetStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800">
          保存
        </button>
      </form>
    </div>
  );
}
