"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Phone, Lock, UserPlus, User, ArrowRight } from "lucide-react";

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
    <div className="animate-fade-in">
      <div className="gradient-header px-6 pb-16 pt-16 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/20 backdrop-blur-sm">
          <UserPlus className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-xl font-bold text-white">创建账号</h1>
        <p className="mt-1 text-sm text-blue-200">加入四师资产租赁平台</p>
      </div>

      <div className="relative -mt-8 px-5">
        <form onSubmit={onSubmit} className="card-elevated-lg space-y-5 p-6 animate-slide-up">
          <div>
            <label htmlFor="m-register-phone" className="mb-2 block text-sm font-medium text-slate-700">手机号</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
              <input id="m-register-phone" name="phone" type="tel" className="input-field !pl-11" placeholder="请输入手机号" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="username" />
            </div>
          </div>
          <div>
            <label htmlFor="m-register-name" className="mb-2 block text-sm font-medium text-slate-700">姓名（可选）</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
              <input id="m-register-name" name="name" className="input-field !pl-11" placeholder="请输入姓名" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          </div>
          <div>
            <label htmlFor="m-register-password" className="mb-2 block text-sm font-medium text-slate-700">密码（至少 6 位）</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
              <input id="m-register-password" name="password" type="password" className="input-field !pl-11" placeholder="请设置密码" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          {error && (
            <div className="animate-scale-in rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}
          <button type="submit" disabled={loading} className="btn-primary flex w-full items-center justify-center gap-2 !py-3.5 text-[15px]">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                提交中…
              </span>
            ) : (
              <span className="flex items-center gap-2">注册并登录 <ArrowRight className="h-4 w-4" /></span>
            )}
          </button>
        </form>
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500">
            已有账号？<Link href="/m/login" className="ml-1 font-semibold text-blue-600">去登录</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
