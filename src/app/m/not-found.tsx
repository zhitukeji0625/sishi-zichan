import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function MobileNotFound() {
  return (
    <div className="animate-fade-in px-4 pt-10">
      <div className="card-elevated-lg p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
          <FileQuestion className="h-8 w-8 text-blue-500" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-800">页面不存在</h1>
        <p className="mt-2 text-sm text-slate-500">您访问的内容可能已删除或链接有误</p>
        <Link href="/m" className="btn-primary mt-6 inline-block px-8">
          返回首页
        </Link>
      </div>
    </div>
  );
}
