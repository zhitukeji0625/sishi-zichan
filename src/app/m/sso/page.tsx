"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SsoInner() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token");
  const [msg, setMsg] = useState("正在验证第三方票据…");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/third-party", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setMsg(j.error ?? "登录失败");
          return;
        }
        router.replace("/m");
        router.refresh();
      } catch {
        if (!cancelled) setMsg("网络异常，请稍后重试");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className="px-4 pt-16 text-center text-sm text-slate-600">
      {!token ? "缺少 token 参数" : msg}
    </div>
  );
}

export default function SsoPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">加载中…</div>}>
      <SsoInner />
    </Suspense>
  );
}
