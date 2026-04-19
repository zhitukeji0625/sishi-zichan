import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { LogOut, Bell, FileText, ChevronRight, Shield } from "lucide-react";
import { endUserLogoutAction } from "./actions";
import { markAllMessagesReadAction } from "./message-actions";

export default async function MMePage() {
  const user = await getCurrentEndUser();
  if (!user) redirect("/m/login");
  const messages = await prisma.messageLog.findMany({
    where: { endUserId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const unreadCount = messages.filter((m) => m.status === "SENT").length;

  return (
    <div className="animate-fade-in">
      {/* 用户中心 / 个人信息：个人资料管理、企业资料管理 */}
      {/* Profile header */}
      <div className="gradient-header px-5 pb-16 pt-12">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-xl font-bold text-white backdrop-blur-sm">
            {(user.name ?? "用")[0]}
          </div>
          <div>
            <div className="text-lg font-bold text-white">{user.name ?? "用户"}</div>
            <div className="mt-0.5 text-sm text-blue-200">{user.phone}</div>
          </div>
        </div>
      </div>

      <div className="relative -mt-8 px-4 space-y-4">
        {/* Quick actions */}
        <div className="card-elevated-lg p-2 animate-slide-up">
          <Link href="/m/orders" className="flex items-center justify-between rounded-xl px-4 py-3.5 transition-colors hover:bg-slate-50 active:bg-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
                <FileText className="h-4.5 w-4.5 text-blue-600" />
              </div>
              <span className="text-sm font-semibold text-slate-800">我的订单</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </Link>
          <div className="mx-4 border-t border-slate-100" />
          <div className="flex items-center justify-between rounded-xl px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
                <Shield className="h-4.5 w-4.5 text-emerald-600" />
              </div>
              <span className="text-sm font-semibold text-slate-800">
                {user.verified ? "已实名认证" : "未认证"}
              </span>
            </div>
            <span className={`status-badge ${user.verified ? "status-success" : "status-pending"}`}>
              {user.verified ? "已认证" : "待认证"}
            </span>
          </div>
        </div>

        {/* Logout */}
        <form action={endUserLogoutAction} className="animate-slide-up stagger-1">
          <button
            type="submit"
            className="card-elevated flex w-full items-center justify-center gap-2 py-3.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 active:bg-red-100"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </form>

        {/* Messages */}
        <div className="animate-slide-up stagger-2">
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-bold text-slate-800">消息通知</span>
              {unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <form action={async () => { "use server"; await markAllMessagesReadAction(); }}>
                <button type="submit" className="text-xs font-medium text-blue-600">全部已读</button>
              </form>
            )}
          </div>
          <div className="space-y-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`card-elevated overflow-hidden transition-colors ${m.status === "SENT" ? "border-l-[3px] border-l-blue-500" : ""}`}
              >
                <div className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {m.status === "SENT" && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />}
                      <span className={`text-sm ${m.status === "SENT" ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                        {m.title}
                      </span>
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {m.createdAt.toISOString().slice(5, 16).replace("T", " ")}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs leading-relaxed text-slate-500">{m.body}</div>
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="card-elevated py-10 text-center">
                <Bell className="mx-auto h-8 w-8 text-slate-200" />
                <p className="mt-2 text-sm text-slate-400">暂无消息</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
