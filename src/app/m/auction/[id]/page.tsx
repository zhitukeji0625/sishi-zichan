import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { getHighestBid } from "@/lib/auction";
import { format } from "date-fns";
import { registerAuctionAction } from "../actions";
import { payAuctionDepositAction } from "../pay-actions";
import { createAuctionContractAction, payAuctionRentAction } from "../../contract/sign-actions";
import { BidForm } from "./BidForm";

export default async function AuctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentEndUser();
  const project = await prisma.auctionProject.findUnique({
    where: { id },
    include: { asset: true, result: true },
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
  const isWinner = user && project.result?.winnerId === user.id && project.result?.status === "PUBLISHED";
  const existingContract = isWinner
    ? await prisma.contract.findFirst({
        where: { auctionProjectId: projectId, endUserId: user.id },
      })
    : null;
  const rentPaid = isWinner
    ? !!(await prisma.payment.findFirst({
        where: { auctionProjectId: projectId, endUserId: user.id, purpose: "AUCTION_RENT", status: "SUCCESS" },
      }))
    : false;

  async function register() {
    "use server";
    await registerAuctionAction(projectId);
  }

  async function payDeposit() {
    "use server";
    await payAuctionDepositAction(projectId);
  }

  async function goToContract() {
    "use server";
    const r = await createAuctionContractAction(projectId);
    if ("contractId" in r && r.contractId) {
      redirect(`/m/contract/${r.contractId}`);
    }
  }

  async function payRent() {
    "use server";
    await payAuctionRentAction(projectId);
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
      {project.result?.status === "PUBLISHED" && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <div className="font-medium">竞拍结果已公示</div>
          {isWinner && <div className="mt-1">恭喜您竞拍成功！</div>}
          {user && project.result?.winnerId && project.result.winnerId !== user.id && (
            <div className="mt-1">很遗憾，您未中标。</div>
          )}
        </div>
      )}
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
      {user && reg?.status === "APPROVED" && reg.depositPaid && project.status === "LIVE" && (() => {
        const minNext = top
          ? Number(top.toString()) + Number(project.bidStep.toString())
          : Number(project.startPrice.toString());
        return <BidForm projectId={projectId} minBid={minNext} />;
      })()}
      {isWinner && !existingContract && (
        <form action={goToContract} className="mt-4">
          <button type="submit" className="w-full rounded-xl bg-blue-700 py-3 text-sm font-medium text-white">
            签署合同
          </button>
        </form>
      )}
      {isWinner && existingContract && existingContract.status === "DRAFT" && (
        <Link
          href={`/m/contract/${existingContract.id}`}
          className="mt-4 block w-full rounded-xl bg-blue-700 py-3 text-center text-sm font-medium text-white"
        >
          继续签署合同
        </Link>
      )}
      {isWinner && existingContract?.status === "SIGNED" && !rentPaid && (
        <form action={payRent} className="mt-4">
          <button type="submit" className="w-full rounded-xl bg-emerald-700 py-3 text-sm font-medium text-white">
            模拟支付租金
          </button>
        </form>
      )}
      {isWinner && rentPaid && (
        <p className="mt-4 text-sm text-emerald-700">租金已支付，流程完成。</p>
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
