import Link from "next/link";
import { Building2, Smartphone, Shield } from "lucide-react";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  let siteName = "四师资产租赁平台";
  try {
    siteName =
      (await prisma.systemConfig.findUnique({ where: { key: "site_name" } }))?.value ?? siteName;
  } catch {
    /* 数据库未就绪时使用默认名称 */
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{siteName}</h1>
      <p className="mt-2 text-slate-600">
        面向师、团、连三级组织的资产竞拍与晒场预约。移动端 H5 与后台管理统一入口。
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/m"
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
        >
          <Smartphone className="mt-0.5 h-6 w-6 shrink-0 text-blue-700" aria-hidden />
          <div>
            <div className="font-medium text-slate-900">移动端 H5</div>
            <div className="mt-1 text-sm text-slate-600">承租用户竞拍、晒场、合同与订单</div>
          </div>
        </Link>
        <Link
          href="/admin/login"
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
        >
          <Building2 className="mt-0.5 h-6 w-6 shrink-0 text-blue-700" aria-hidden />
          <div>
            <div className="font-medium text-slate-900">后台管理</div>
            <div className="mt-1 text-sm text-slate-600">师 / 团 / 连管理员工作台</div>
          </div>
        </Link>
      </div>
      <div className="mt-8 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
        <p>
          第三方接入请使用 JWT 票据访问{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-800">
            /api/auth/third-party
          </code>
          ；独立用户可使用手机号注册登录。
        </p>
      </div>
    </div>
  );
}
