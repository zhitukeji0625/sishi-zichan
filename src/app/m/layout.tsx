import Link from "next/link";
import { Home, Gavel, Sun, User } from "lucide-react";

export default function MLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[var(--background)]">
      <div className="pb-24">{children}</div>
      <nav className="fixed bottom-0 left-0 right-0 z-30 md:left-1/2 md:max-w-lg md:-translate-x-1/2">
        <div className="mx-2 mb-2 rounded-2xl border border-white/20 bg-white/90 shadow-lg shadow-black/5 backdrop-blur-xl">
          <div className="grid grid-cols-4 py-1">
            <Link href="/m" className="group flex flex-col items-center gap-0.5 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors group-hover:bg-blue-50">
                <Home className="h-[22px] w-[22px] text-slate-400 transition-colors group-hover:text-blue-600" />
              </div>
              <span className="text-[10px] font-medium text-slate-400 transition-colors group-hover:text-blue-600">首页</span>
            </Link>
            <Link href="/m/auction" className="group flex flex-col items-center gap-0.5 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors group-hover:bg-blue-50">
                <Gavel className="h-[22px] w-[22px] text-slate-400 transition-colors group-hover:text-blue-600" />
              </div>
              <span className="text-[10px] font-medium text-slate-400 transition-colors group-hover:text-blue-600">竞拍</span>
            </Link>
            <Link href="/m/drying" className="group flex flex-col items-center gap-0.5 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors group-hover:bg-blue-50">
                <Sun className="h-[22px] w-[22px] text-slate-400 transition-colors group-hover:text-blue-600" />
              </div>
              <span className="text-[10px] font-medium text-slate-400 transition-colors group-hover:text-blue-600">晒场</span>
            </Link>
            <Link href="/m/me" className="group flex flex-col items-center gap-0.5 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors group-hover:bg-blue-50">
                <User className="h-[22px] w-[22px] text-slate-400 transition-colors group-hover:text-blue-600" />
              </div>
              <span className="text-[10px] font-medium text-slate-400 transition-colors group-hover:text-blue-600">我的</span>
            </Link>
          </div>
        </div>
        <div className="h-[env(safe-area-inset-bottom)] bg-transparent" />
      </nav>
    </div>
  );
}
