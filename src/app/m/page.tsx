import Link from "next/link";
import { ChevronRight, LogIn, Megaphone, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";

export default async function MHomePage() {
  const user = await getCurrentEndUser();
  const announcements = await prisma.announcement.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 5,
  });

  return (
    <div className="px-4 pt-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">四师资产租赁</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user ? `您好，${user.name ?? user.phone}` : "登录后可参与竞拍与晒场预约"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link
            href="/m/auction"
            className="rounded-xl bg-blue-700 px-4 py-3 text-center text-sm font-medium !text-white hover:bg-blue-800"
          >
            资产竞拍
          </Link>
          <Link
            href="/m/drying"
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            晒场预约
          </Link>
        </div>
        {user && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Link
              href="/m/orders"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              我的订单
            </Link>
            <Link
              href="/m/me"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              个人中心
            </Link>
          </div>
        )}
        {!user && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="mb-3 text-center text-sm text-slate-500">尚未登录</p>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/m/login"
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-blue-700 bg-white py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                <LogIn className="h-4 w-4 shrink-0" aria-hidden />
                登录
              </Link>
              <Link
                href="/m/register"
                className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
                注册
              </Link>
            </div>
          </div>
        )}
      </div>
      <div className="mt-6">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-800">
          <Megaphone className="h-4 w-4 text-slate-500" aria-hidden />
          最新公告
        </div>
        <div className="space-y-2">
          {announcements.map((a) => (
            <Link
              key={a.id}
              href={`/m/announcements/${a.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
            >
              <span className="line-clamp-1">{a.title}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            </Link>
          ))}
          {announcements.length === 0 && <p className="text-sm text-slate-500">暂无公告</p>}
        </div>
      </div>
    </div>
  );
}
