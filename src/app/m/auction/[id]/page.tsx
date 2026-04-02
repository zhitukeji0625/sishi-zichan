import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { getHighestBid } from "@/lib/auction";
import { format } from "date-fns";
import { registerAuctionAction } from "../actions";
import { payAuctionDepositAction } from "../pay-actions";
import { BidForm } from "./BidForm";

export default async function AuctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentEndUser();
  const project = await prisma.auctionProject.findUnique({
    where: { id },
    include: { asset: true },
  });
  if (!project) notFound();
  const projectId = project.id;
  const top = await getHighestBid(projectId);
  const reg = user
    ? await prisma.auctionRegistration.findUnique({
        where: { projectId_endUserId: { projectId, endUserId: user.id } },
      })
    : null;
  const bids = await prisma.auctionBid.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { amount: true, createdAt: true },
  });

  async function register() {
    "use server";
    await registerAuctionAction(projectId);
  }

  async function payDeposit() {
    "use server";
    await payAuctionDepositAction(projectId);
  }

  return (
    <div className="px-4 pt-6">
      <Link href="/m/auction" className="text-sm text-blue-700">
        ← 返回列表
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">{project.asset.name}</h1>
      <p className="mt-1 text-sm text-slate-500">{project.code}</p>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-sm text-slate-700">
        <div>状态：{project.status}</div>
        <div className="mt-1">起拍价：¥{project.startPrice.toString()}</div>
        <div className="mt-1">加价幅度：¥{project.bidStep.toString()}</div>
        <div className="mt-1">保证金：¥{project.depositAmount.toString()}</div>
        <div className="mt-1">
          当前最高：¥{top ? top.toString() : project.startPrice.toString()}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {format(project.startsAt, "yyyy-MM-dd HH:mm")} — {format(project.endsAt, "yyyy-MM-dd HH:mm")}
        </div>
      </div>
      {user && !reg && project.status !== "ENDED" && (
        <form action={register} className="mt-4">
          <button type="submit" className="w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white">
            报名参与
          </button>
        </form>
      )}
      {user && reg?.status === "PENDING" && (
        <p className="mt-4 text-sm text-amber-700">报名审核中</p>
      )}
      {user && reg?.status === "REJECTED" && (
        <p className="mt-4 text-sm text-red-600">报名未通过：{reg.rejectReason}</p>
      )}
      {user && reg?.status === "APPROVED" && !reg.depositPaid && (
        <form action={payDeposit} className="mt-4">
          <button type="submit" className="w-full rounded-xl bg-blue-700 py-3 text-sm font-medium text-white">
            模拟缴纳保证金（农行演示）
          </button>
        </form>
      )}
      {user && reg?.status === "APPROVED" && reg.depositPaid && project.status === "LIVE" && (
        <BidForm projectId={projectId} />
      )}
      <div className="mt-6">
        <div className="text-sm font-medium text-slate-800">出价动态（匿名）</div>
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {bids.map((b, i) => (
            <li key={i}>
              ¥{b.amount.toString()} · {format(b.createdAt, "HH:mm:ss")}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
