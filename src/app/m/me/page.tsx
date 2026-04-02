import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { LogOut, Bell } from "lucide-react";
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

  return (
    <div className="px-4 pt-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold text-slate-900">{user.name ?? "用户"}</div>
        <div className="text-sm text-slate-500">{user.phone}</div>
        <div className="mt-4 flex gap-3 text-sm">
          <Link href="/m/orders" className="text-blue-700">
            我的订单
          </Link>
        </div>
        <form action={endUserLogoutAction} className="mt-4">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm text-slate-700"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            退出登录
          </button>
        </form>
      </div>
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <Bell className="h-4 w-4 text-slate-500" aria-hidden />
            消息
            {messages.filter((m) => m.status === "SENT").length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
                {messages.filter((m) => m.status === "SENT").length}
              </span>
            )}
          </div>
          {messages.filter((m) => m.status === "SENT").length > 0 && (
            <form
              action={async () => {
                "use server";
                await markAllMessagesReadAction();
              }}
            >
              <button type="submit" className="text-xs text-blue-700 hover:text-blue-800">
                全部已读
              </button>
            </form>
          )}
        </div>
        <div className="space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl border bg-white p-3 text-sm shadow-sm ${m.status === "SENT" ? "border-blue-300" : "border-slate-200"}`}
            >
              <div className="flex items-center gap-2">
                {m.status === "SENT" && <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />}
                <span className={m.status === "SENT" ? "font-semibold text-slate-900" : "font-medium text-slate-900"}>{m.title}</span>
              </div>
              <div className="text-xs text-slate-500">{m.createdAt.toISOString().slice(0, 19).replace("T", " ")}</div>
              <div className="mt-1 text-slate-600">{m.body}</div>
            </div>
          ))}
          {messages.length === 0 && <p className="text-sm text-slate-500">暂无消息</p>}
        </div>
      </div>
    </div>
  );
}
