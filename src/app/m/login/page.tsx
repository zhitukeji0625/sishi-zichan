"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Phone, Lock, ArrowRight } from "lucide-react";

export default function MLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "登录失败");
        return;
      }
      router.replace("/m");
      router.refresh();
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="gradient-header px-6 pb-16 pt-16 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/20 backdrop-blur-sm">
          <Lock className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-xl font-bold text-white">欢迎回来</h1>
        <p className="mt-1 text-sm text-blue-200">登录四师资产租赁平台</p>
      </div>

      <div className="relative -mt-8 px-5">
        <form onSubmit={onSubmit} className="card-elevated-lg space-y-5 p-6 animate-slide-up">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">手机号</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
              <input
                type="tel"
                className="input-field !pl-11"
                placeholder="请输入手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="username"
              />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">密码</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                className="input-field !pl-11"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>
          {error && (
            <div className="animate-scale-in rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex w-full items-center justify-center gap-2 !py-3.5 text-[15px]"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                登录中…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                登录
                <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500">
            没有账号？
            <Link href="/m/register" className="ml-1 font-semibold text-blue-600">
              立即注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
