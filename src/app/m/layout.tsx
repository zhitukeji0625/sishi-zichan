import Link from "next/link";
import { Home, Gavel, Sun, User } from "lucide-react";

export default function MLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 pb-20">
      {children}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:left-1/2 md:max-w-lg md:-translate-x-1/2">
        <div className="grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          <Link href="/m" className="flex flex-col items-center py-2 text-xs text-slate-600 hover:text-blue-700">
            <Home className="h-5 w-5" aria-hidden />
            首页
          </Link>
          <Link href="/m/auction" className="flex flex-col items-center py-2 text-xs text-slate-600 hover:text-blue-700">
            <Gavel className="h-5 w-5" aria-hidden />
            竞拍
          </Link>
          <Link href="/m/drying" className="flex flex-col items-center py-2 text-xs text-slate-600 hover:text-blue-700">
            <Sun className="h-5 w-5" aria-hidden />
            晒场
          </Link>
          <Link href="/m/me" className="flex flex-col items-center py-2 text-xs text-slate-600 hover:text-blue-700">
            <User className="h-5 w-5" aria-hidden />
            我的
          </Link>
        </div>
      </nav>
    </div>
  );
}
