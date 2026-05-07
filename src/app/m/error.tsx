"use client";

import { AlertTriangle } from "lucide-react";

export default function MobileError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="card-elevated-lg w-full max-w-sm p-8 text-center animate-scale-in">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-7 w-7 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">出错了</h2>
        <p className="mt-2 text-sm text-slate-500">{error.message || "页面加载失败，请稍后重试"}</p>
        <button onClick={reset} className="btn-primary mt-5 w-full !py-3">
          重试
        </button>
      </div>
    </div>
  );
}
