import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";

export default async function MOrdersPage() {
  const user = await getCurrentEndUser();
  if (!user) redirect("/m/login");
  const [payments, reservations] = await Promise.all([
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
  ]);

  return (
    <div className="px-4 pt-6">
      <h1 className="text-lg font-semibold text-slate-900">我的订单</h1>
      <div className="mt-4 space-y-6">
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
        <section>
          <h2 className="text-sm font-medium text-slate-700">晒场预约</h2>
          <ul className="mt-2 space-y-2">
            {reservations.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                <div>{r.listing.asset.name}</div>
                <div className="text-xs text-slate-500">
                  {r.orderNo} · {r.status}
                </div>
              </li>
            ))}
            {reservations.length === 0 && <p className="text-sm text-slate-500">暂无</p>}
          </ul>
        </section>
      </div>
      <Link href="/m/me" className="mt-6 inline-block text-sm text-blue-700">
        返回我的
      </Link>
    </div>
  );
}
