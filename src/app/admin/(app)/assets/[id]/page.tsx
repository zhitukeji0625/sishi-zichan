import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminCanAccessOrg } from "@/lib/rbac";
import { deleteAssetAction } from "../edit-actions";
import { AssetForm } from "../AssetForm";

export default async function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  const asset = await prisma.asset.findUnique({ where: { id }, include: { org: true } });
  if (!asset) notFound();
  const canAccess = await adminCanAccessOrg(admin.role, admin.orgId, asset.orgId);
  if (!canAccess) notFound();
  const assetId = asset.id;

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
      <div className="mt-6">
        <AssetForm
          orgs={[{ id: asset.orgId, name: asset.org.name, code: asset.org.code }]}
          defaultOrgId={asset.orgId}
          action="edit"
          asset={{
            id: asset.id,
            name: asset.name,
            type: asset.type,
            locationText: asset.locationText,
            specs: asset.specs,
            description: asset.description,
            refPriceMin: asset.refPriceMin?.toString() ?? null,
            refPriceMax: asset.refPriceMax?.toString() ?? null,
            status: asset.status,
            imagesJson: asset.imagesJson,
            orgId: asset.orgId,
          }}
        />
      </div>
      <form action={handleDelete} className="mt-4">
        <button type="submit" className="w-full rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50">
          删除资产
        </button>
      </form>
    </div>
  );
}
