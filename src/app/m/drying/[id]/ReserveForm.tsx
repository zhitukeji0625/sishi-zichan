"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Send } from "lucide-react";

export function ReserveForm({ listingId, minDate, maxDate }: { listingId: string; minDate: string; maxDate: string }) {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
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
      setMsg({ text: j.error ?? "提交失败", ok: false });
      return;
    }
    setMsg({ text: `预约已提交，单号 ${j.orderNo}`, ok: true });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card-elevated overflow-hidden animate-slide-up stagger-1">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-bold text-slate-800">预约时段</span>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <label htmlFor="reserve-start-date" className="mb-1.5 block text-sm font-medium text-slate-600">开始日期</label>
          <input id="reserve-start-date" name="startDate" type="date" required min={minDate} max={maxDate} className="input-field" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="reserve-end-date" className="mb-1.5 block text-sm font-medium text-slate-600">结束日期</label>
          <input id="reserve-end-date" name="endDate" type="date" required min={minDate} max={maxDate} className="input-field" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {msg && (
          <div className={`animate-scale-in rounded-xl px-4 py-2.5 text-sm font-medium ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            {msg.text}
          </div>
        )}
        <button type="submit" disabled={loading} className="btn-primary flex w-full items-center justify-center gap-2 !py-3.5 text-[15px]">
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {loading ? "提交中…" : "提交预约申请"}
        </button>
      </div>
    </form>
  );
}
