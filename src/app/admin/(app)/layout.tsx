import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, LogOut, Package, Gavel, Megaphone, Sun, FileText, ClipboardList, Building2, Users, Settings, BookOpen } from "lucide-react";
import { getCurrentAdmin } from "@/lib/auth/session";
import { roleLabel } from "@/lib/rbac";
import { adminLogoutAction } from "./actions";

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");

  const nav = [
    { href: "/admin", label: "概览", icon: LayoutDashboard },
    { href: "/admin/assets", label: "资产", icon: Package },
    { href: "/admin/auctions", label: "竞拍", icon: Gavel },
    { href: "/admin/registrations", label: "报名审核", icon: FileText },
    { href: "/admin/announcements", label: "公告", icon: Megaphone },
    { href: "/admin/drying", label: "晒场预约", icon: Sun },
    { href: "/admin/organizations", label: "组织架构", icon: Building2 },
    { href: "/admin/admins", label: "账号管理", icon: Users },
    { href: "/admin/config", label: "系统配置", icon: Settings },
    { href: "/admin/dict", label: "数据字典", icon: BookOpen },
    { href: "/admin/audit", label: "操作日志", icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 z-10 hidden h-full w-56 border-r border-slate-200 bg-white md:block">
        <div className="border-b border-slate-100 px-4 py-4">
          <div className="text-sm font-semibold text-slate-900">四师资产租赁</div>
          <div className="mt-1 text-xs text-slate-500">
            {admin.name} · {roleLabel(admin.role)}
          </div>
        </div>
        <nav className="space-y-0.5 p-2">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              {item.label}
            </Link>
          );})}
        </nav>
        <form action={adminLogoutAction} className="absolute bottom-4 left-2 right-2">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            退出
          </button>
        </form>
      </aside>
      <main className="md:pl-56">
        <div className="border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="text-sm font-medium text-slate-900">管理后台</div>
        </div>
        <nav className="flex gap-2 overflow-x-auto border-b border-slate-100 bg-white px-4 py-2 md:hidden">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
            <Link
              key={item.href}
              href={item.href}
              className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {item.label}
            </Link>
          );})}
        </nav>
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
