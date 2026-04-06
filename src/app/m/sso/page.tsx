"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SsoInner({ token }: { token: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState(() =>
    token ? "正在验证第三方票据…" : "缺少 token 参数",
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
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
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className="px-4 pt-16 text-center text-sm text-slate-600">
      {msg}
    </div>
  );
}

export default function SsoPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">加载中…</div>}>
      <SsoKey />
    </Suspense>
  );
}

function SsoKey() {
  const search = useSearchParams();
  const token = search.get("token");
  return <SsoInner key={token ?? ""} token={token} />;
}
