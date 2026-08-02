import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-6xl font-black text-slate-300">404</h1>
      <p className="text-lg text-slate-600">页面不存在</p>
      <div className="flex gap-4">
        <Link href="/" className="text-blue-600 hover:underline">
          返回首页
        </Link>
        <Link href="/m" className="text-blue-600 hover:underline">
          移动端
        </Link>
      </div>
    </div>
  );
}
