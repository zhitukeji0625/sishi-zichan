import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { ReserveForm } from "./ReserveForm";
import { eachDayOfInterval, format, startOfDay, addDays } from "date-fns";
import { getCapacityForDay } from "@/lib/drying";

export default async function DryingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentEndUser();
  const listing = await prisma.dryingFieldListing.findUnique({
    where: { id },
    include: { asset: true, bookingRules: true },
  });
  if (!listing) notFound();
  const rule = listing.bookingRules[0];
  const maxAdvance = Math.max(0, rule?.maxAdvanceDays ?? 7);
  const today = startOfDay(new Date());
  const horizon = addDays(today, maxAdvance);
  const days =
    horizon >= today ? eachDayOfInterval({ start: today, end: horizon }).slice(0, 8) : [today];
  const dayStats = await Promise.all(
    days.map(async (d) => {
      const s = await getCapacityForDay(listing.id, d);
      return { date: d, ...s };
    }),
  );

  return (
    <div className="animate-fade-in">
      <div className="gradient-header bg-gradient-to-br from-amber-500 to-orange-600 px-5 pb-12 pt-8">
        <Link href="/m/drying" className="mb-3 inline-flex items-center gap-1 text-xs text-amber-100 hover:text-white">
          ← 返回晒场
        </Link>
        <h1 className="text-lg font-bold text-white">{listing.asset.name}</h1>
        <p className="mt-1 text-xs text-amber-100">{listing.asset.locationText}</p>
      </div>
      <div className="relative -mt-6 px-4 space-y-4">
        <div className="card-elevated-lg p-5 animate-slide-up">
          <div className="mb-3 text-sm font-bold text-slate-800">近期容量</div>
          <div className="grid grid-cols-4 gap-2">
            {dayStats.map((d) => {
              const pct = d.max > 0 ? d.booked / d.max : 0;
              return (
                <div key={d.date.toISOString()} className="rounded-xl bg-slate-50 p-2.5 text-center">
                  <div className="text-xs font-bold text-slate-700">{format(d.date, "MM/dd")}</div>
                  <div className={`mt-1 text-[11px] font-semibold ${pct >= 1 ? "text-red-500" : pct >= 0.7 ? "text-amber-500" : "text-emerald-600"}`}>
                    {d.booked}/{d.max}
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${pct >= 1 ? "bg-red-400" : pct >= 0.7 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {user ? (
          <ReserveForm listingId={listing.id} minDate={format(today, "yyyy-MM-dd")} maxDate={format(horizon, "yyyy-MM-dd")} />
        ) : (
          <div className="card-elevated p-5 text-center">
            <p className="text-sm text-slate-500">请先<Link href="/m/login" className="font-semibold text-blue-600">登录</Link>后预约</p>
          </div>
        )}
      </div>
    </div>
  );
}
