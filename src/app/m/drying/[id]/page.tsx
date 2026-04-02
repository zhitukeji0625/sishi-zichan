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
  const maxAdvance = rule?.maxAdvanceDays ?? 7;
  const today = startOfDay(new Date());
  const horizon = addDays(today, maxAdvance);
  const days = eachDayOfInterval({ start: today, end: horizon }).slice(0, 8);
  const dayStats = await Promise.all(
    days.map(async (d) => {
      const s = await getCapacityForDay(listing.id, d);
      return { date: d, ...s };
    }),
  );

  return (
    <div className="px-4 pt-6">
      <Link href="/m/drying" className="text-sm text-blue-700">
        ← 返回
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">{listing.asset.name}</h1>
      <p className="mt-1 text-sm text-slate-500">{listing.asset.locationText}</p>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-medium text-slate-800">近几日容量</div>
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {dayStats.map((d) => (
            <li key={d.date.toISOString()}>
              {format(d.date, "MM-dd")}：已约 {d.booked}/{d.max}
            </li>
          ))}
        </ul>
      </div>
      {user ? (
        <ReserveForm listingId={listing.id} />
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          请先<Link href="/m/login">登录</Link>后预约
        </p>
      )}
    </div>
  );
}
