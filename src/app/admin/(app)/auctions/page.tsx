import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { orgFilterForAdmin } from "@/lib/admin-scope";
import { isDivision, isRegimentOrAbove } from "@/lib/rbac";
import { getDictMap } from "@/lib/dict";
import { createAuctionProjectAction } from "./actions";
import { generateAuctionResultAction, reviewAuctionResultAction } from "./result-actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { refreshAuctionProjectStatuses } from "@/lib/cron";

export default async function AdminAuctionsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  await refreshAuctionProjectStatuses();
  const orgWhere = await orgFilterForAdmin(admin.role, admin.orgId);
  const projects = await prisma.auctionProject.findMany({
    where: { asset: orgWhere },
    include: { asset: true, result: { include: { project: true } } },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const assets = await prisma.asset.findMany({
    where: { ...orgWhere, type: { not: "DRYING_FIELD" } },
    orderBy: { name: "asc" },
  });

  const auctionStatusMap = await getDictMap("auction_status");

  async function createAction(fd: FormData) {
    "use server";
    const r = await createAuctionProjectAction(fd);
    if (r.error) {
      redirect(`/admin/auctions?error=${encodeURIComponent(r.error)}`);
    }
    redirect("/admin/auctions");
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">竞拍项目</h1>
      {isRegimentOrAbove(admin.role) && (
        <form
          action={createAction}
          className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-sm font-medium text-slate-800">发布竞拍</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-slate-600">关联资产</label>
              <select name="assetId" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">起拍价</label>
              <input name="startPrice" type="number" step="0.01" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">加价幅度</label>
              <input name="bidStep" type="number" step="0.01" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">保证金</label>
              <input name="depositAmount" type="number" step="0.01" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">付款期限(天)</label>
              <input name="paymentDays" type="number" defaultValue={7} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">开始时间</label>
              <input name="startsAt" type="datetime-local" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">结束时间</label>
              <input name="endsAt" type="datetime-local" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-slate-600">租赁期限说明</label>
              <textarea name="leaseTermDesc" rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
            发布
          </button>
        </form>
      )}
      <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">编号</th>
              <th className="px-4 py-3 font-medium">资产</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">时间</th>
              <th className="px-4 py-3 font-medium">结果</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const projectId = p.id;
              return (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs"><Link href={`/admin/auctions/${p.id}`} className="text-blue-700 hover:underline">{p.code}</Link></td>
                  <td className="px-4 py-3 text-slate-700">{p.asset.name}</td>
                  <td className="px-4 py-3 text-slate-600">{auctionStatusMap[p.status] ?? p.status}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {p.startsAt.toISOString().slice(0, 16)} — {p.endsAt.toISOString().slice(0, 16)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {p.result ? (p.result.status === "PUBLISHED" ? "已公示" : p.result.status === "PENDING_REVIEW" ? "待审核" : p.result.status === "REJECTED" ? "已驳回" : p.result.status) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {p.status === "ENDED" && !p.result && isRegimentOrAbove(admin.role) && (
                        <form
                          action={async () => {
                            "use server";
                            await generateAuctionResultAction(projectId);
                          }}
                        >
                          <button type="submit" className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs text-white">
                            生成结果
                          </button>
                        </form>
                      )}
                      {p.result && p.result.status === "PENDING_REVIEW" && isDivision(admin.role) && (
                        <>
                          <form action={reviewAuctionResultAction}>
                            <input type="hidden" name="id" value={p.result.id} />
                            <input type="hidden" name="approve" value="true" />
                            <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs text-white">
                              审核通过
                            </button>
                          </form>
                          <form action={reviewAuctionResultAction}>
                            <input type="hidden" name="id" value={p.result.id} />
                            <input type="hidden" name="approve" value="false" />
                            <button type="submit" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700">
                              驳回
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
