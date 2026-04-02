import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { signContractAction } from "../sign-actions";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentEndUser();
  if (!user) redirect("/m/login");
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract || contract.endUserId !== user.id) notFound();
  const contractId = contract.id;

  async function sign() {
    "use server";
    await signContractAction(contractId);
  }

  return (
    <div className="px-4 pt-6">
      <Link href="/m/orders" className="text-sm text-blue-700">
        ← 返回订单
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">电子合同</h1>
      <div className="mt-1 text-xs text-slate-500">状态：{contract.status === "DRAFT" ? "待签署" : contract.status === "SIGNED" ? "已签署" : contract.status}</div>
      <div
        className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700 shadow-sm [&_p]:mb-2"
        dangerouslySetInnerHTML={{ __html: contract.htmlBody }}
      />
      {contract.status === "DRAFT" && (
        <form action={sign} className="mt-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" required />
            我已阅读并同意合同内容
          </label>
          <button
            type="submit"
            className="mt-3 w-full rounded-xl bg-blue-700 py-3 text-sm font-medium text-white"
          >
            确认签署
          </button>
        </form>
      )}
      {contract.status === "SIGNED" && (
        <p className="mt-4 text-sm text-emerald-700">合同已签署完成</p>
      )}
    </div>
  );
}
