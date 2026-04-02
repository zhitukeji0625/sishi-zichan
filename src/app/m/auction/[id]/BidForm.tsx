"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BidForm({ projectId, minBid }: { projectId: string; minBid: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const res = await fetch(`/api/m/auction/${projectId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parseFloat(amount) }),
    });
    setLoading(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? "出价失败");
      return;
    }
    setMsg("出价成功");
    setAmount("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-medium text-slate-800">出价</div>
      <p className="text-xs text-slate-500">最低出价：¥{minBid.toFixed(2)}</p>
      <input
        type="number"
        step="0.01"
        min={minBid}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        placeholder={`≥ ¥${minBid.toFixed(2)}`}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      {msg && <p className="text-xs text-slate-600">{msg}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-700 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "提交中…" : "确认出价"}
      </button>
    </form>
  );
}
