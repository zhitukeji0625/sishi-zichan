import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { adminScopedOrgIds } from "@/lib/rbac";
import { AssetForm } from "../AssetForm";

export default async function NewAssetPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  const scope = await adminScopedOrgIds(admin.role, admin.orgId);
  const orgIds = scope === "ALL" ? null : scope;
  const orgs = await prisma.organization.findMany({
    where: orgIds ? { id: { in: orgIds } } : {},
    orderBy: { code: "asc" },
  });

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-semibold text-slate-900">录入资产</h1>
      <div className="mt-6">
        <AssetForm
          orgs={orgs.map((o) => ({ id: o.id, name: o.name, code: o.code }))}
          defaultOrgId={admin.orgId}
          action="create"
        />
      </div>
    </div>
  );
}
