"use client";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">系统异常</h1>
          <p className="mt-2 text-slate-500">{error.message || "请刷新页面重试"}</p>
          <button
            onClick={reset}
            className="mt-4 rounded-lg bg-blue-700 px-6 py-2 text-white"
          >
            刷新
          </button>
        </div>
      </body>
    </html>
  );
}
