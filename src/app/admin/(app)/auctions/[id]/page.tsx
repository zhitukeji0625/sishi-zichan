import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { orgFilterForAdmin } from "@/lib/admin-scope";

export default async function AdminAuctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const project = await prisma.auctionProject.findUnique({
    where: { id },
    include: {
      asset: { include: { org: true } },
      result: true,
      registrations: { include: { endUser: { select: { id: true, name: true, phone: true } } }, orderBy: { createdAt: "desc" } },
      bids: { include: { endUser: { select: { id: true, name: true, phone: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
      payments: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!project) notFound();

  return (
    <div>
      <Link href="/admin/auctions" className="text-sm text-blue-700">← 返回竞拍列表</Link>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">{project.asset.name}</h1>
      <p className="mt-1 text-sm text-slate-500">编号：{project.code} · 状态：{project.status}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-sm text-slate-700">
          <div className="font-medium text-slate-800 mb-2">竞拍信息</div>
          <div>起拍价：¥{project.startPrice.toString()}</div>
          <div>加价幅度：¥{project.bidStep.toString()}</div>
          <div>保证金：¥{project.depositAmount.toString()}</div>
          <div>付款期限：{project.paymentDays} 天</div>
          <div className="text-xs text-slate-500 mt-2">
            {project.startsAt.toISOString().slice(0, 16)} — {project.endsAt.toISOString().slice(0, 16)}
          </div>
          {project.leaseTermDesc && <div className="mt-2 text-xs text-slate-500">租赁说明：{project.leaseTermDesc}</div>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-sm">
          <div className="font-medium text-slate-800 mb-2">资产信息</div>
          <div className="text-slate-700">{project.asset.name}</div>
          <div className="text-xs text-slate-500">{project.asset.type} · {project.asset.org.name}</div>
          <div className="text-xs text-slate-500">{project.asset.locationText}</div>
          {project.result && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="font-medium text-slate-800">竞拍结果</div>
              <div className="text-slate-600">状态：{project.result.status}</div>
              {project.result.winnerId && <div className="text-slate-600">中标人 ID：{project.result.winnerId.slice(0, 8)}…</div>}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-medium text-slate-800">报名列表（{project.registrations.length}）</h2>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">手机号</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">保证金</th>
              </tr>
            </thead>
            <tbody>
              {project.registrations.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-slate-700">{r.endUser.name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{r.endUser.phone}</td>
                  <td className="px-4 py-3 text-slate-600">{r.status}</td>
                  <td className="px-4 py-3 text-slate-600">{r.depositPaid ? "已缴" : "未缴"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-medium text-slate-800">出价记录（最近 50 条）</h2>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">时间</th>
              </tr>
            </thead>
            <tbody>
              {project.bids.map((b) => (
                <tr key={b.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-slate-700">{b.endUser.name ?? b.endUser.phone}</td>
                  <td className="px-4 py-3 font-mono text-slate-800">¥{b.amount.toString()}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{b.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-medium text-slate-800">支付记录</h2>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">单号</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">用途</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {project.payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.orderNo}</td>
                  <td className="px-4 py-3 text-slate-800">¥{p.amount.toString()}</td>
                  <td className="px-4 py-3 text-slate-600">{p.purpose}</td>
                  <td className="px-4 py-3 text-slate-600">{p.status}</td>
                </tr>
              ))}
              {project.payments.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">暂无支付记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
