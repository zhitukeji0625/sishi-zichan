import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { orgFilterForAdmin } from "@/lib/admin-scope";
import { reviewReservationFormAction } from "./actions";

export default async function AdminDryingPage() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const orgWhere = await orgFilterForAdmin(admin.role, admin.orgId);
  const list = await prisma.dryingReservation.findMany({
    where: { listing: { asset: orgWhere } },
    include: {
      endUser: true,
      listing: { include: { asset: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">晒场预约</h1>
      <div className="mt-6 space-y-3">
        {list.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between"
          >
            <div>
              <div className="font-medium text-slate-900">{r.listing.asset.name}</div>
              <div className="text-sm text-slate-600">
                单号 {r.orderNo} · {r.endUser.name ?? r.endUser.phone}
              </div>
              <div className="text-xs text-slate-500">
                {r.startDate.toISOString().slice(0, 10)} — {r.endDate.toISOString().slice(0, 10)} · {r.status}
              </div>
            </div>
            {admin.role === "COMPANY_ADMIN" && r.status === "PENDING_REVIEW" && (
              <div className="flex gap-2">
                <form action={reviewReservationFormAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="approve" value="true" />
                  <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white">
                    通过
                  </button>
                </form>
                <form action={reviewReservationFormAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="approve" value="false" />
                  <button type="submit" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                    驳回
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && <p className="text-slate-500">暂无预约</p>}
      </div>
    </div>
  );
}
