"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";

export function BidForm({ projectId, minBid }: { projectId: string; minBid: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount.trim()) {
      setMsg({ text: "请输入出价金额", ok: false });
      return;
    }
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMsg({ text: "出价金额无效", ok: false });
      return;
    }
    setLoading(true);
    setMsg(null);
    const res = await fetch(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parsed }),
    });
    setLoading(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ text: j.error ?? "出价失败", ok: false });
      return;
    }
    setMsg({ text: "出价成功！", ok: true });
    setAmount("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card-elevated overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">我要出价</span>
          <span className="status-badge status-live">最低 ¥{minBid.toFixed(2)}</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">¥</span>
          <input
            type="number"
            step="0.01"
            min={minBid}
            className="input-field !pl-10 !text-lg font-bold"
            placeholder={minBid.toFixed(2)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {msg && (
          <div className={`animate-scale-in rounded-xl px-4 py-2.5 text-sm font-medium ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            {msg.text}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex w-full items-center justify-center gap-2 !py-3.5 text-[15px]"
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <ArrowUp className="h-4.5 w-4.5" />
          )}
          {loading ? "出价中…" : "确认出价"}
        </button>
      </div>
    </form>
  );
}
