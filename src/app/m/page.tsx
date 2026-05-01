import Link from "next/link";
import { ChevronRight, Gavel, Sun, FileText, User, LogIn, UserPlus, Megaphone, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";

export default async function MHomePage() {
  const user = await getCurrentEndUser();
  const announcements = await prisma.announcement.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 5,
  });
  const liveCount = await prisma.auctionProject.count({ where: { status: "LIVE" } });

  return (
    <div className="animate-fade-in">
      {/* Hero header */}
      <div className="gradient-header px-5 pb-12 pt-12">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">四师资产租赁</h1>
            <p className="text-xs text-blue-200">
              {user ? `您好，${user.name ?? user.phone}` : "资产竞拍 · 晒场预约"}
            </p>
          </div>
        </div>
      </div>

      {/* Feature cards - overlapping header */}
      <div className="relative -mt-8 px-4">
        <div className="card-elevated-lg p-5 animate-slide-up">
          <div className="grid grid-cols-2 gap-3">
            <Link href="/m/auction" className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 p-4 text-white transition-transform active:scale-[0.98]">
              <Gavel className="mb-2 h-7 w-7 text-blue-200" />
              <div className="text-sm font-bold">资产竞拍</div>
              <div className="mt-0.5 text-[11px] text-blue-200">{liveCount > 0 ? `${liveCount} 场进行中` : "查看全部项目"}</div>
              <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/10" />
            </Link>
            <Link href="/m/drying" className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-white transition-transform active:scale-[0.98]">
              <Sun className="mb-2 h-7 w-7 text-amber-200" />
              <div className="text-sm font-bold">晒场预约</div>
              <div className="mt-0.5 text-[11px] text-amber-100">在线预约晒场</div>
              <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/10" />
            </Link>
          </div>
          {user && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Link href="/m/orders" className="flex items-center gap-3 rounded-xl bg-slate-50 p-3.5 transition-colors hover:bg-slate-100 active:bg-slate-200">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
                  <FileText className="h-4.5 w-4.5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">我的订单</div>
                  <div className="text-[11px] text-slate-400">查看订单和合同</div>
                </div>
              </Link>
              <Link href="/m/me" className="flex items-center gap-3 rounded-xl bg-slate-50 p-3.5 transition-colors hover:bg-slate-100 active:bg-slate-200">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
                  <User className="h-4.5 w-4.5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">个人中心</div>
                  <div className="text-[11px] text-slate-400">账号与消息</div>
                </div>
              </Link>
            </div>
          )}
        </div>

        {/* Login prompt */}
        {!user && (
          <div className="card-elevated mt-4 p-5 animate-slide-up stagger-1">
            <div className="mb-4 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                <LogIn className="h-6 w-6 text-blue-600" />
              </div>
              <p className="text-sm text-slate-500">登录后参与竞拍与晒场预约</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/m/login" className="flex items-center justify-center gap-2 rounded-xl border-2 border-blue-600 py-3 text-sm font-bold text-blue-600 transition-colors hover:bg-blue-50 active:bg-blue-100">
                <LogIn className="h-4 w-4" />
                登录
              </Link>
              <Link href="/m/register" className="btn-primary flex items-center justify-center gap-2 !py-3">
                <UserPlus className="h-4 w-4" />
                注册
              </Link>
            </div>
          </div>
        )}

        {/* Announcements */}
        <div className="mt-5 animate-slide-up stagger-2">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Megaphone className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-bold text-slate-800">最新公告</span>
          </div>
          <div className="space-y-2">
            {announcements.map((a, i) => (
              <Link
                key={a.id}
                href={`/m/announcements/${a.id}`}
                className={`card-elevated flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-slate-50 active:bg-slate-100 stagger-${i + 1}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                    <Megaphone className="h-4 w-4 text-amber-500" />
                  </div>
                  <span className="line-clamp-1 text-sm text-slate-700">{a.title}</span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </Link>
            ))}
            {announcements.length === 0 && (
              <div className="card-elevated py-8 text-center text-sm text-slate-400">暂无公告</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
