import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { payDryingDepositAction } from "../drying/pay-actions";
import { createDryingContractAction } from "../contract/sign-actions";
import { cancelReservationAction } from "./actions";

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

  const statusLabel: Record<string, string> = {
    PENDING_REVIEW: "待审核",
    APPROVED: "已通过·待付保证金",
    REJECTED: "已驳回",
    PENDING_PAYMENT: "待支付",
    CONTRACT_PENDING: "待签合同",
    ACTIVE: "使用中",
    CANCELLED: "已取消",
    COMPLETED: "已完成",
    PAID: "已支付",
  };

  return (
    <div className="px-4 pt-6">
      <h1 className="text-lg font-semibold text-slate-900">我的订单</h1>
      <div className="mt-4 space-y-6">
        <section>
          <h2 className="text-sm font-medium text-slate-700">晒场预约</h2>
          <ul className="mt-2 space-y-2">
            {reservations.map((r) => {
              const resId = r.id;
              return (
                <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                  <div className="font-medium text-slate-900">{r.listing.asset.name}</div>
                  <div className="text-xs text-slate-500">
                    {r.orderNo} · {statusLabel[r.status] ?? r.status}
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.startDate.toISOString().slice(0, 10)} — {r.endDate.toISOString().slice(0, 10)}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {r.status === "APPROVED" && (
                      <form
                        action={async () => {
                          "use server";
                          await payDryingDepositAction(resId);
                        }}
                      >
                        <button type="submit" className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs text-white">
                          模拟缴纳保证金
                        </button>
                      </form>
                    )}
                    {r.status === "CONTRACT_PENDING" && (
                      <form
                        action={async () => {
                          "use server";
                          const result = await createDryingContractAction(resId);
                          if ("contractId" in result && result.contractId) {
                            redirect(`/m/contract/${result.contractId}`);
                          }
                        }}
                      >
                        <button type="submit" className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs text-white">
                          签署合同
                        </button>
                      </form>
                    )}
                    {(r.status === "PENDING_REVIEW" || r.status === "APPROVED") && (
                      <form
                        action={async () => {
                          "use server";
                          await cancelReservationAction(resId);
                        }}
                      >
                        <button type="submit" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700">
                          取消预约
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
            {reservations.length === 0 && <p className="text-sm text-slate-500">暂无</p>}
          </ul>
        </section>
        <section>
          <h2 className="text-sm font-medium text-slate-700">合同</h2>
          <ul className="mt-2 space-y-2">
            {contracts.map((c) => (
              <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                <div className="text-slate-800">{c.type === "AUCTION_LEASE" ? "竞拍租赁" : "晒场租赁"}</div>
                <div className="text-xs text-slate-500">
                  {c.status === "DRAFT" ? "待签署" : c.status === "SIGNED" ? "已签署" : c.status}
                </div>
                <Link href={`/m/contract/${c.id}`} className="mt-1 inline-block text-xs text-blue-700">
                  查看合同
                </Link>
              </li>
            ))}
            {contracts.length === 0 && <p className="text-sm text-slate-500">暂无</p>}
          </ul>
        </section>
        <section>
          <h2 className="text-sm font-medium text-slate-700">支付记录</h2>
          <ul className="mt-2 space-y-2">
            {payments.map((p) => (
              <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                <div className="font-mono text-xs text-slate-500">{p.orderNo}</div>
                <div className="text-slate-800">
                  ¥{p.amount.toString()} · {p.purpose} · {p.status}
                </div>
              </li>
            ))}
            {payments.length === 0 && <p className="text-sm text-slate-500">暂无</p>}
          </ul>
        </section>
      </div>
      <Link href="/m/me" className="mt-6 inline-block text-sm text-blue-700">
        返回我的
      </Link>
    </div>
  );
}
