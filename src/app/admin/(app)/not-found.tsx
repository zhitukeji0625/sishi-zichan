import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">页面不存在</h1>
      <p className="mt-2 text-sm text-slate-500">未找到对应的管理页面或记录</p>
      <Link href="/admin" className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
        返回工作台
      </Link>
    </div>
  );
}
