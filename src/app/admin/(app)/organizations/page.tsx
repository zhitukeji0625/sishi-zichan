import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { isDivision } from "@/lib/rbac";
import { OrgLevel } from "@prisma/client";
import { createOrgAction } from "./actions";

export default async function AdminOrganizationsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const orgs = await prisma.organization.findMany({
    include: { parent: { select: { name: true } } },
    orderBy: [{ level: "asc" }, { code: "asc" }],
  });

  const levelLabel: Record<string, string> = {
    DIVISION: "师",
    REGIMENT: "团",
    COMPANY: "连",
  };

  async function create(fd: FormData) {
    "use server";
    const r = await createOrgAction(fd);
    if (r.error) redirect(`/admin/organizations?error=${encodeURIComponent(r.error)}`);
    redirect("/admin/organizations");
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">组织架构</h1>
      <p className="mt-1 text-sm text-slate-500">管理师/团/连三级组织架构。</p>

      {isDivision(admin.role) && (
        <form action={create} className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-slate-800">新增组织</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-600">名称</label>
              <input name="name" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">代码</label>
              <input name="code" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">级别</label>
              <select name="level" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {Object.values(OrgLevel).map((l) => (
                  <option key={l} value={l}>{levelLabel[l] ?? l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">上级组织</label>
              <select name="parentId" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">无</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}（{o.code}）</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">负责人</label>
              <input name="leaderName" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">联系电话</label>
              <input name="phone" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">新增</button>
        </form>
      )}

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">代码</th>
              <th className="px-4 py-3 font-medium">级别</th>
              <th className="px-4 py-3 font-medium">上级</th>
              <th className="px-4 py-3 font-medium">负责人</th>
              <th className="px-4 py-3 font-medium">电话</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-slate-900">{o.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{o.code}</td>
                <td className="px-4 py-3 text-slate-600">{levelLabel[o.level] ?? o.level}</td>
                <td className="px-4 py-3 text-slate-500">{o.parent?.name ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{o.leaderName ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{o.phone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
