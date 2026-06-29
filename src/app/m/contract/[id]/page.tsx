import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { signContractAction } from "../sign-actions";
import { FileText, CheckCircle, ChevronLeft } from "lucide-react";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentEndUser();
  if (!user) redirect("/m/login");
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract || contract.endUserId !== user.id) notFound();
  const contractId = contract.id;

  async function sign() {
    "use server";
    const r = await signContractAction(contractId);
    if ("error" in r) return;
    redirect(`/m/contract/${contractId}`);
  }

  return (
    <div className="animate-fade-in">
      <div className="gradient-header px-5 pb-12 pt-8">
        <Link href="/m/orders" className="mb-3 inline-flex items-center gap-1 text-xs text-blue-200 hover:text-white">
          <ChevronLeft className="h-3.5 w-3.5" /> 返回订单
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">电子合同</h1>
            <span className={`status-badge mt-1 ${contract.status === "SIGNED" ? "bg-emerald-400/20 text-emerald-100" : "bg-white/20 text-white"}`}>
              {contract.status === "DRAFT" ? "待签署" : contract.status === "SIGNED" ? "已签署" : contract.status}
            </span>
          </div>
        </div>
      </div>

      <div className="relative -mt-6 px-4 space-y-4">
        <div className="card-elevated-lg overflow-hidden animate-slide-up">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
            <span className="text-xs font-medium text-slate-500">合同正文</span>
          </div>
          <div
            className="p-5 text-sm leading-relaxed text-slate-700 [&_p]:mb-3"
            dangerouslySetInnerHTML={{ __html: contract.htmlBody }}
          />
        </div>

        {contract.status === "DRAFT" && (
          <form action={sign} className="card-elevated p-5 animate-slide-up stagger-1">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" required className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600" />
              <span className="text-sm text-slate-600">我已仔细阅读并同意以上合同全部条款</span>
            </label>
            <button type="submit" className="btn-primary mt-4 w-full !py-3.5 text-[15px]">
              确认签署合同
            </button>
          </form>
        )}

        {contract.status === "SIGNED" && (
          <div className="card-elevated flex items-center gap-3 border-emerald-200 bg-emerald-50 p-5 animate-scale-in">
            <CheckCircle className="h-6 w-6 text-emerald-500" />
            <div>
              <div className="text-sm font-bold text-emerald-800">合同已签署完成</div>
              <div className="text-xs text-emerald-600">合同具有法律效力</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
