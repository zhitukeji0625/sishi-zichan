"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SsoInner() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token");
  const initialMsg = useMemo(
    () => (token ? "正在验证第三方票据…" : "缺少 token 参数"),
    [token],
  );
  const [msg, setMsg] = useState(initialMsg);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    (async () => {
      const res = await fetch("/api/auth/third-party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(j.error ?? "登录失败");
        return;
      }
      router.replace("/m");
      router.refresh();
    })();
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
      <SsoInner />
    </Suspense>
  );
}
