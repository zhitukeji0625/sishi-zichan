"use client";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6">
      <h2 className="text-lg font-semibold text-red-800">操作出错</h2>
      <p className="mt-2 text-sm text-red-600">{error.message || "页面加载失败，请稍后重试。"}</p>
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-800"
      >
        重试
      </button>
    </div>
  );
}
