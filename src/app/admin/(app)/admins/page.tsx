import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { isDivision, roleLabel } from "@/lib/rbac";
import { AdminRole } from "@prisma/client";
import { createAdminAction, toggleAdminDisableAction } from "./actions";

export default async function AdminUsersPage() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const admins = await prisma.adminUser.findMany({
    include: { org: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const orgs = await prisma.organization.findMany({ orderBy: { code: "asc" } });

  async function create(fd: FormData) {
    "use server";
    const r = await createAdminAction(fd);
    if (r.error) redirect(`/admin/admins?error=${encodeURIComponent(r.error)}`);
    redirect("/admin/admins");
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">管理员账号</h1>
      <p className="mt-1 text-sm text-slate-500">管理各级管理员账号信息。</p>

      {isDivision(admin.role) && (
        <form action={create} className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-slate-800">添加管理员</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-600">手机号</label>
              <input name="phone" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">密码</label>
              <input name="password" type="password" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">姓名</label>
              <input name="name" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">角色</label>
              <select name="role" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {Object.values(AdminRole).map((r) => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-slate-600">所属组织</label>
              <select name="orgId" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}（{o.code}）</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">添加</button>
        </form>
      )}

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">姓名</th>
              <th className="px-4 py-3 font-medium">手机号</th>
              <th className="px-4 py-3 font-medium">角色</th>
              <th className="px-4 py-3 font-medium">组织</th>
              <th className="px-4 py-3 font-medium">状态</th>
              {isDivision(admin.role) && <th className="px-4 py-3 font-medium">操作</th>}
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-slate-900">{a.name}</td>
                <td className="px-4 py-3 text-slate-500">{a.phone}</td>
                <td className="px-4 py-3 text-slate-600">{roleLabel(a.role)}</td>
                <td className="px-4 py-3 text-slate-600">{a.org.name}</td>
                <td className="px-4 py-3">
                  {a.disabled ? (
                    <span className="text-red-600">已禁用</span>
                  ) : (
                    <span className="text-emerald-600">正常</span>
                  )}
                </td>
                {isDivision(admin.role) && (
                  <td className="px-4 py-3">
                    {a.id !== admin.id && (
                      <form action={toggleAdminDisableAction} className="inline">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="disable" value={a.disabled ? "false" : "true"} />
                        <button type="submit" className="text-xs text-blue-700 hover:underline">
                          {a.disabled ? "启用" : "禁用"}
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
