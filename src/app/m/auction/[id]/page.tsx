import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { getHighestBid } from "@/lib/auction";
import { format } from "date-fns";
import { ChevronLeft } from "lucide-react";
import { registerAuctionAction } from "../actions";
import { payAuctionDepositAction } from "../pay-actions";
import { createAuctionContractAction, payAuctionRentAction } from "../../contract/sign-actions";
import { BidForm } from "./BidForm";

function parseAssetImageUrls(imagesJson: string | null): string[] {
  if (!imagesJson) return [];
  try {
    const parsed = JSON.parse(imagesJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

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

  const statusInfo: Record<string, { label: string; cls: string }> = {
    LIVE: { label: "竞拍中", cls: "status-live" },
    SCHEDULED: { label: "即将开始", cls: "status-scheduled" },
    ENDED: { label: "已结束", cls: "status-ended" },
  };
  const st = statusInfo[project.status] ?? { label: project.status, cls: "status-ended" };
  const imageUrls = parseAssetImageUrls(project.asset.imagesJson);

  return (
    <div className="animate-fade-in">
      <div className="gradient-header px-5 pb-12 pt-8">
        <Link href="/m/auction" className="mb-3 inline-flex items-center gap-1 text-xs text-blue-200 hover:text-white">
          <ChevronLeft className="h-3.5 w-3.5" /> 返回列表
        </Link>
        <h1 className="text-lg font-bold text-white">{project.asset.name}</h1>
        <div className="mt-1 flex items-center gap-2">
          <span className={`status-badge ${st.cls}`}>{st.label}</span>
          <span className="text-xs text-blue-200">{project.code}</span>
        </div>
      </div>

      <div className="relative -mt-6 px-4 space-y-4">
        {imageUrls.length > 0 ? (
          <div className="card-elevated-lg overflow-hidden animate-slide-up">
            <div className="flex gap-2 overflow-x-auto p-3">
              {imageUrls.map((url, i) => (
                <img key={i} src={url} alt="" className="h-40 w-60 shrink-0 rounded-xl object-cover" />
              ))}
            </div>
          </div>
        ) : null}

        {/* Price info card */}
        <div className="card-elevated-lg p-5 animate-slide-up">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-medium text-slate-400">当前最高出价</div>
              <div className="mt-1 text-2xl font-black text-blue-600">
                ¥{top ? top.toString() : project.startPrice.toString()}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-medium text-slate-400">起拍价</div>
              <div className="mt-1 text-lg font-bold text-slate-700">¥{project.startPrice.toString()}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
            <div className="text-center">
              <div className="text-[11px] text-slate-400">加价幅度</div>
              <div className="mt-0.5 text-sm font-bold text-slate-700">¥{project.bidStep.toString()}</div>
            </div>
            <div className="text-center">
              <div className="text-[11px] text-slate-400">保证金</div>
              <div className="mt-0.5 text-sm font-bold text-slate-700">¥{project.depositAmount.toString()}</div>
            </div>
            <div className="text-center">
              <div className="text-[11px] text-slate-400">竞拍时段</div>
              <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                {format(project.startsAt, "MM/dd HH:mm")}
              </div>
            </div>
          </div>
        </div>

        {/* Result banner */}
        {project.result?.status === "PUBLISHED" && (
          <div className={`card-elevated overflow-hidden animate-scale-in ${isWinner ? "border-emerald-200 bg-emerald-50" : "border-slate-200"}`}>
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isWinner ? "bg-emerald-100" : "bg-slate-100"}`}>
                  {isWinner ? <span className="text-lg">🎉</span> : <span className="text-lg">📋</span>}
                </div>
                <div>
                  <div className={`font-bold ${isWinner ? "text-emerald-800" : "text-slate-700"}`}>
                    {isWinner ? "恭喜您竞拍成功！" : "竞拍结果已公示"}
                  </div>
                  {user && project.result?.winnerId && project.result.winnerId !== user.id && (
                    <div className="text-sm text-slate-500">很遗憾，您未中标</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3 animate-slide-up stagger-2">
          {user && !reg && project.status !== "ENDED" && (
            <form action={register}>
              <button type="submit" className="btn-primary w-full !py-3.5 text-[15px]">报名参与竞拍</button>
            </form>
          )}
          {user && reg?.status === "PENDING" && (
            <div className="card-elevated flex items-center gap-3 p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                <span className="text-sm">⏳</span>
              </div>
              <div>
                <div className="text-sm font-semibold text-amber-800">报名审核中</div>
                <div className="text-xs text-amber-600">请等待连队管理员审核</div>
              </div>
            </div>
          )}
          {user && reg?.status === "REJECTED" && (
            <div className="card-elevated flex items-center gap-3 border-red-200 bg-red-50 p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                <span className="text-sm">✗</span>
              </div>
              <div>
                <div className="text-sm font-semibold text-red-800">报名未通过</div>
                <div className="text-xs text-red-600">{reg.rejectReason}</div>
              </div>
            </div>
          )}
          {user && reg?.status === "APPROVED" && !reg.depositPaid && (
            <form action={payDeposit}>
              <button type="submit" className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-[15px] font-bold text-white shadow-md shadow-amber-500/20">
                缴纳保证金 ¥{project.depositAmount.toString()}
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
            <form action={goToContract}>
              <button type="submit" className="btn-primary w-full !py-3.5 text-[15px]">签署合同</button>
            </form>
          )}
          {isWinner && existingContract && existingContract.status === "DRAFT" && (
            <Link href={`/m/contract/${existingContract.id}`} className="btn-primary block w-full text-center !py-3.5 text-[15px]">
              继续签署合同
            </Link>
          )}
          {isWinner && existingContract?.status === "SIGNED" && !rentPaid && (
            <form action={payRent}>
              <button type="submit" className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3.5 text-[15px] font-bold text-white shadow-md shadow-emerald-500/20">
                支付租金
              </button>
            </form>
          )}
          {isWinner && rentPaid && (
            <div className="card-elevated flex items-center gap-3 border-emerald-200 bg-emerald-50 p-4">
              <span className="text-lg">✅</span>
              <div className="text-sm font-semibold text-emerald-700">租金已支付，全部流程已完成</div>
            </div>
          )}
        </div>

        {/* Bid history */}
        <div className="card-elevated p-5 animate-slide-up stagger-3">
          <div className="mb-3 text-sm font-bold text-slate-800">出价记录</div>
          {bids.length > 0 ? (
            <div className="space-y-2">
              {bids.map((b, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${i === 0 ? "bg-blue-500" : "bg-slate-300"}`} />
                    <span className={`font-mono text-sm ${i === 0 ? "font-bold text-blue-600" : "text-slate-600"}`}>
                      ¥{b.amount.toString()}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">{format(b.createdAt, "HH:mm:ss")}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-slate-400">暂无出价</div>
          )}
        </div>
      </div>
    </div>
  );
}
