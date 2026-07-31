"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerAuctionAction } from "../actions";
import { payAuctionDepositAction } from "../pay-actions";
import { createAuctionContractAction, payAuctionRentAction } from "../../contract/sign-actions";

type Props = {
  projectId: string;
  depositAmount: string;
  user: { id: string } | null;
  reg: { status: string; depositPaid: boolean; rejectReason: string | null } | null;
  projectStatus: string;
  isWinner: boolean;
  existingContract: { id: string; status: string } | null;
  rentPaid: boolean;
};

export function AuctionActionButtons({
  projectId,
  depositAmount,
  user,
  reg,
  projectStatus,
  isWinner,
  existingContract,
  rentPaid,
}: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function runAction(key: string, action: () => Promise<{ error?: string; contractId?: string }>) {
    setLoading(key);
    setMsg(null);
    const r = await action();
    setLoading(null);
    if (r.error) {
      setMsg({ text: r.error, ok: false });
      return;
    }
    if ("contractId" in r && r.contractId) {
      router.push(`/m/contract/${r.contractId}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3 animate-slide-up stagger-2">
      {msg && (
        <div className={`animate-scale-in rounded-xl px-4 py-2.5 text-sm font-medium ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </div>
      )}
      {user && !reg && projectStatus !== "ENDED" && (
        <button
          type="button"
          disabled={loading === "register"}
          onClick={() => runAction("register", () => registerAuctionAction(projectId))}
          className="btn-primary w-full !py-3.5 text-[15px] disabled:opacity-50"
        >
          {loading === "register" ? "提交中…" : "报名参与竞拍"}
        </button>
      )}
      {user && reg?.status === "PENDING" && (
        <div className="card-elevated flex items-center gap-3 p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
            <span className="text-sm">⏳</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-amber-800">报名审核中</div>
            <div className="text-xs text-amber-600">请等待管理员审核</div>
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
        <button
          type="button"
          disabled={loading === "deposit"}
          onClick={() => runAction("deposit", () => payAuctionDepositAction(projectId))}
          className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-[15px] font-bold text-white shadow-md shadow-amber-500/20 disabled:opacity-50"
        >
          {loading === "deposit" ? "处理中…" : `缴纳保证金 ¥${depositAmount}`}
        </button>
      )}
      {isWinner && !existingContract && (
        <button
          type="button"
          disabled={loading === "contract"}
          onClick={() => runAction("contract", () => createAuctionContractAction(projectId))}
          className="btn-primary w-full !py-3.5 text-[15px] disabled:opacity-50"
        >
          {loading === "contract" ? "处理中…" : "签署合同"}
        </button>
      )}
      {isWinner && existingContract && existingContract.status === "DRAFT" && (
        <Link href={`/m/contract/${existingContract.id}`} className="btn-primary block w-full text-center !py-3.5 text-[15px]">
          继续签署合同
        </Link>
      )}
      {isWinner && existingContract?.status === "SIGNED" && !rentPaid && (
        <button
          type="button"
          disabled={loading === "rent"}
          onClick={() => runAction("rent", () => payAuctionRentAction(projectId))}
          className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3.5 text-[15px] font-bold text-white shadow-md shadow-emerald-500/20 disabled:opacity-50"
        >
          {loading === "rent" ? "处理中…" : "支付租金"}
        </button>
      )}
      {isWinner && rentPaid && (
        <div className="card-elevated flex items-center gap-3 border-emerald-200 bg-emerald-50 p-4">
          <span className="text-lg">✅</span>
          <div className="text-sm font-semibold text-emerald-700">租金已支付，全部流程已完成</div>
        </div>
      )}
    </div>
  );
}
