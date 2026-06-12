import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { orgFilterForAdmin } from "@/lib/admin-scope";
import { adminCanAccessOrg } from "@/lib/rbac";
import { reviewRegistrationFormAction } from "./actions";
import { getDictMap } from "@/lib/dict";

async function handleReview(formData: FormData) {
  "use server";
  await reviewRegistrationFormAction(formData);
}

export default async function AdminRegistrationsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const orgWhere = await orgFilterForAdmin(admin.role, admin.orgId);
  const list = await prisma.auctionRegistration.findMany({
    where: { project: { asset: orgWhere } },
    include: {
      endUser: true,
      project: { include: { asset: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const regStatusMap = await getDictMap("registration_status");

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">竞拍报名审核</h1>
      <p className="mt-1 text-sm text-slate-500">管辖范围内的管理员可操作通过/驳回。</p>
      <div className="mt-6 space-y-3">
        {await Promise.all(list.map(async (r) => {
          const canReview = await adminCanAccessOrg(admin.role, admin.orgId, r.project.asset.orgId);
          return (
          <div
            key={r.id}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between"
          >
            <div>
              <div className="font-medium text-slate-900">{r.endUser.name ?? r.endUser.phone}</div>
              <div className="text-sm text-slate-600">
                {r.project.asset.name} · {r.project.code}
              </div>
              <div className="text-xs text-slate-500">状态：{regStatusMap[r.status] ?? r.status}</div>
            </div>
            {canReview && r.status === "PENDING" && (
              <div className="flex gap-2">
                <form action={handleReview}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="approve" value="true" />
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800"
                  >
                    通过
                  </button>
                </form>
                <form action={handleReview}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="approve" value="false" />
                  <input type="hidden" name="rejectReason" value="资料不全" />
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    驳回
                  </button>
                </form>
              </div>
            )}
          </div>
          );
        }))}
        {list.length === 0 && <p className="text-slate-500">暂无报名</p>}
      </div>
    </div>
  );
}
