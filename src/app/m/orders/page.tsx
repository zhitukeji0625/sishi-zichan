import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { payDryingDepositAction } from "../drying/pay-actions";
import { createDryingContractAction } from "../contract/sign-actions";
import { cancelReservationAction } from "./actions";
import { FileText, CreditCard, Sun, ChevronLeft } from "lucide-react";

export default async function MOrdersPage() {
  const user = await getCurrentEndUser();
  if (!user) redirect("/m/login");
  const [payments, reservations, contracts] = await Promise.all([
    prisma.payment.findMany({
      where: { endUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.dryingReservation.findMany({
      where: { endUserId: user.id },
      include: { listing: { include: { asset: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.contract.findMany({
      where: { endUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const statusLabel: Record<string, { text: string; cls: string }> = {
    PENDING_REVIEW: { text: "待审核", cls: "status-pending" },
    APPROVED: { text: "待付保证金", cls: "status-approved" },
    REJECTED: { text: "已驳回", cls: "status-rejected" },
    PENDING_PAYMENT: { text: "待支付", cls: "status-pending" },
    CONTRACT_PENDING: { text: "待签合同", cls: "status-scheduled" },
    ACTIVE: { text: "使用中", cls: "status-live" },
    CANCELLED: { text: "已取消", cls: "status-ended" },
    COMPLETED: { text: "已完成", cls: "status-success" },
    PAID: { text: "已支付", cls: "status-success" },
  };

  const purposeLabel: Record<string, string> = {
    AUCTION_DEPOSIT: "竞拍保证金",
    AUCTION_RENT: "竞拍租金",
    DRYING_DEPOSIT: "晒场保证金",
    DRYING_RENT: "晒场租金",
  };

  const payStatusLabel: Record<string, { text: string; cls: string }> = {
    SUCCESS: { text: "成功", cls: "status-success" },
    PENDING: { text: "待支付", cls: "status-pending" },
    FAILED: { text: "失败", cls: "status-rejected" },
    REFUNDED: { text: "已退款", cls: "status-ended" },
  };

  return (
    <div className="animate-fade-in">
      <div className="gradient-header px-5 pb-10 pt-10">
        <div className="flex items-center gap-2">
          <Link href="/m/me" className="text-blue-200 hover:text-white"><ChevronLeft className="h-5 w-5" /></Link>
          <h1 className="text-lg font-bold text-white">我的订单</h1>
        </div>
      </div>

      <div className="relative -mt-6 px-4 space-y-5">
        {/* Reservations */}
        <section className="animate-slide-up">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Sun className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-bold text-slate-800">晒场预约</span>
            <span className="text-xs text-slate-400">({reservations.length})</span>
          </div>
          <div className="space-y-2">
            {reservations.map((r) => {
              const resId = r.id;
              const sl = statusLabel[r.status] ?? { text: r.status, cls: "status-ended" };
              return (
                <div key={r.id} className="card-elevated overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-800">{r.listing.asset.name}</div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          {r.startDate.toISOString().slice(0, 10)} — {r.endDate.toISOString().slice(0, 10)}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-slate-300">{r.orderNo}</div>
                      </div>
                      <span className={`status-badge shrink-0 ${sl.cls}`}>{sl.text}</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      {r.status === "APPROVED" && (
                        <form action={async () => { "use server"; await payDryingDepositAction(resId); }}>
                          <button type="submit" className="rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2 text-xs font-bold text-white shadow-sm">
                            缴纳保证金
                          </button>
                        </form>
                      )}
                      {r.status === "CONTRACT_PENDING" && (
                        <form action={async () => { "use server"; const result = await createDryingContractAction(resId); if ("contractId" in result && result.contractId) { redirect(`/m/contract/${result.contractId}`); } }}>
                          <button type="submit" className="btn-primary !py-2 !px-4 !text-xs">签署合同</button>
                        </form>
                      )}
                      {(r.status === "PENDING_REVIEW" || r.status === "APPROVED") && (
                        <form action={async () => { "use server"; await cancelReservationAction(resId); }}>
                          <button type="submit" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50">
                            取消
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {reservations.length === 0 && <div className="card-elevated py-8 text-center text-sm text-slate-400">暂无预约</div>}
          </div>
        </section>

        {/* Contracts */}
        <section className="animate-slide-up stagger-1">
          <div className="mb-3 flex items-center gap-2 px-1">
            <FileText className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-bold text-slate-800">合同</span>
            <span className="text-xs text-slate-400">({contracts.length})</span>
          </div>
          <div className="space-y-2">
            {contracts.map((c) => (
              <Link key={c.id} href={`/m/contract/${c.id}`} className="card-elevated block p-4 transition-colors hover:bg-slate-50 active:bg-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.type === "AUCTION_LEASE" ? "bg-blue-100" : "bg-amber-100"}`}>
                      <FileText className={`h-4 w-4 ${c.type === "AUCTION_LEASE" ? "text-blue-600" : "text-amber-600"}`} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{c.type === "AUCTION_LEASE" ? "竞拍租赁合同" : "晒场租赁合同"}</div>
                      <div className="text-[11px] text-slate-400">{c.createdAt.toISOString().slice(0, 10)}</div>
                    </div>
                  </div>
                  <span className={`status-badge ${c.status === "SIGNED" ? "status-success" : "status-pending"}`}>
                    {c.status === "DRAFT" ? "待签署" : c.status === "SIGNED" ? "已签署" : c.status}
                  </span>
                </div>
              </Link>
            ))}
            {contracts.length === 0 && <div className="card-elevated py-8 text-center text-sm text-slate-400">暂无合同</div>}
          </div>
        </section>

        {/* Payments */}
        <section className="animate-slide-up stagger-2">
          <div className="mb-3 flex items-center gap-2 px-1">
            <CreditCard className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-bold text-slate-800">支付记录</span>
            <span className="text-xs text-slate-400">({payments.length})</span>
          </div>
          <div className="space-y-2">
            {payments.map((p) => {
              const ps = payStatusLabel[p.status] ?? { text: p.status, cls: "status-ended" };
              return (
                <div key={p.id} className="card-elevated p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{purposeLabel[p.purpose] ?? p.purpose}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-slate-300">{p.orderNo}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold text-slate-800">¥{p.amount.toString()}</div>
                      <span className={`status-badge mt-1 ${ps.cls}`}>{ps.text}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {payments.length === 0 && <div className="card-elevated py-8 text-center text-sm text-slate-400">暂无支付记录</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
