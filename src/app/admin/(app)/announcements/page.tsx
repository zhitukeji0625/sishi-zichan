import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { orgFilterForAdmin } from "@/lib/admin-scope";
import { adminScopedOrgIds, isDivision, isRegimentOrAbove } from "@/lib/rbac";
import { createAnnouncementAction, reviewAnnouncementFormAction } from "./actions";

export default async function AdminAnnouncementsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const orgWhere = await orgFilterForAdmin(admin.role, admin.orgId);
  const scope = await adminScopedOrgIds(admin.role, admin.orgId);
  const orgs = await prisma.organization.findMany({
    where: scope === "ALL" ? {} : { id: { in: scope } },
    orderBy: { code: "asc" },
  });
  const list = await prisma.announcement.findMany({
    where: orgWhere,
    include: { org: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  async function create(fd: FormData) {
    "use server";
    const r = await createAnnouncementAction(fd);
    if (r.error) {
      redirect(`/admin/announcements?error=${encodeURIComponent(r.error)}`);
    }
    redirect("/admin/announcements");
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">公告</h1>
      {isRegimentOrAbove(admin.role) && (
        <form action={create} className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-slate-800">新建公告</h2>
          <div>
            <label className="mb-1 block text-xs text-slate-600">组织</label>
            <select name="orgId" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" defaultValue={admin.orgId}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">标题</label>
            <input name="title" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">内容 HTML</label>
            <textarea name="content" required rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800">
            提交
          </button>
          {!isDivision(admin.role) && (
            <p className="text-xs text-slate-500">团级提交后需师级审核发布。</p>
          )}
        </form>
      )}
      <div className="mt-8 space-y-3">
        {list.map((a) => (
          <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium text-slate-900">{a.title}</div>
                <div className="text-xs text-slate-500">
                  {a.org.name} · {a.status}
                </div>
              </div>
              {isDivision(admin.role) && a.status === "PENDING_REVIEW" && (
                <div className="flex gap-2">
                  <form action={reviewAnnouncementFormAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="approve" value="true" />
                    <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs text-white">
                      审核通过
                    </button>
                  </form>
                  <form action={reviewAnnouncementFormAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="approve" value="false" />
                    <button type="submit" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700">
                      驳回
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
