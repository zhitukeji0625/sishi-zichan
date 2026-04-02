"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function MRegisterPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password, name: name || undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "注册失败");
      return;
    }
    router.replace("/m");
    router.refresh();
  }

  return (
    <div className="px-4 pt-8">
      <h1 className="text-xl font-semibold text-slate-900">注册</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className="mb-1 block text-sm text-slate-600">手机号</label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">姓名（可选）</label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">密码（至少 6 位）</label>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "提交中…" : "注册并登录"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        已有账号？<Link href="/m/login">登录</Link>
      </p>
    </div>
  );
}
