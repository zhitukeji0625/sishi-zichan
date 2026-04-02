"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReserveForm({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const res = await fetch("/api/m/drying/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, startDate, endDate }),
    });
    setLoading(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? "提交失败");
      return;
    }
    setMsg(`已提交，单号 ${j.orderNo}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-800">预约时段</div>
      <div>
        <label className="text-xs text-slate-500">开始日期</label>
        <input
          type="date"
          required
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs text-slate-500">结束日期</label>
        <input
          type="date"
          required
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
      {msg && <p className="text-xs text-slate-600">{msg}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "提交中…" : "提交预约申请"}
      </button>
    </form>
  );
}
