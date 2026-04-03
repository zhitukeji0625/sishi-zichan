import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { orgFilterForAdmin } from "@/lib/admin-scope";
import { reviewReservationFormAction } from "./actions";
import { createDryingListingAction, toggleDryingListingStatusAction } from "./listing-actions";
import { dryingListingStatusLabels, reservationStatusLabels } from "@/lib/labels";
import type { DryingListingStatus, ReservationStatus } from "@prisma/client";

async function handleReview(formData: FormData) {
  "use server";
  await reviewReservationFormAction(formData);
}

export default async function AdminDryingPage() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const orgWhere = await orgFilterForAdmin(admin.role, admin.orgId);
  const listings = await prisma.dryingFieldListing.findMany({
    where: { asset: orgWhere },
    include: { asset: true },
    orderBy: { createdAt: "desc" },
  });
  const dryingAssets = await prisma.asset.findMany({
    where: { ...orgWhere, type: "DRYING_FIELD", dryingListing: null },
    orderBy: { name: "asc" },
  });
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

      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900">晒场上架管理</h2>
        {dryingAssets.length > 0 && (
          <form action={async (fd: FormData) => { "use server"; await createDryingListingAction(fd); }} className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-medium text-slate-800">上架新晒场</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <select name="assetId" required className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {dryingAssets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <input name="maxPeople" type="number" defaultValue={10} placeholder="每日最大人数" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input name="maxAdvanceDays" type="number" defaultValue={7} placeholder="提前预约天数" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">上架</button>
          </form>
        )}
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">晒场</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-slate-900">{l.asset.name}</td>
                  <td className="px-4 py-3 text-slate-600">{dryingListingStatusLabels[l.status as DryingListingStatus] ?? l.status}</td>
                  <td className="px-4 py-3">
                    <form action={async (fd: FormData) => { "use server"; await toggleDryingListingStatusAction(fd); }} className="inline-flex gap-2">
                      <input type="hidden" name="listingId" value={l.id} />
                      <input type="hidden" name="status" value={l.status === "OPERATING" ? "PAUSED" : "OPERATING"} />
                      <button type="submit" className="text-xs text-blue-700 hover:underline">
                        {l.status === "OPERATING" ? "暂停" : "恢复运营"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {listings.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">暂无晒场上架</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                {r.startDate.toISOString().slice(0, 10)} — {r.endDate.toISOString().slice(0, 10)} · {reservationStatusLabels[r.status as ReservationStatus] ?? r.status}
              </div>
            </div>
            {admin.role === "COMPANY_ADMIN" && r.status === "PENDING_REVIEW" && (
              <div className="flex gap-2">
                <form action={handleReview}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="approve" value="true" />
                  <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white">
                    通过
                  </button>
                </form>
                <form action={handleReview}>
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
