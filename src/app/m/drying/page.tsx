import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Sun, MapPin } from "lucide-react";

export default async function MDryingListPage() {
  const listings = await prisma.dryingFieldListing.findMany({
    where: { status: "OPERATING" },
    include: { asset: true },
  });

  return (
    <div className="animate-fade-in">
      <div className="gradient-header bg-gradient-to-br from-amber-500 to-orange-600 px-5 pb-10 pt-10">
        <h1 className="text-lg font-bold text-white">晒场预约</h1>
        <p className="mt-1 text-xs text-amber-100">选择晒场，在线预约使用时段</p>
      </div>
      <div className="relative -mt-6 px-4 space-y-3">
        {listings.map((l, i) => (
          <Link
            key={l.id}
            href={`/m/drying/${l.id}`}
            className={`card-elevated-lg block overflow-hidden transition-transform active:scale-[0.98] animate-slide-up stagger-${Math.min(i + 1, 5)}`}
          >
            <div className="aspect-[2.5/1] bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
              <Sun className="h-12 w-12 text-amber-300" />
            </div>
            <div className="p-4">
              <div className="text-[15px] font-bold text-slate-800">{l.asset.name}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                <MapPin className="h-3 w-3" />
                {l.asset.locationText}
              </div>
              <div className="mt-2">
                <span className="status-badge status-live">运营中</span>
              </div>
            </div>
          </Link>
        ))}
        {listings.length === 0 && (
          <div className="card-elevated py-12 text-center">
            <Sun className="mx-auto h-10 w-10 text-slate-200" />
            <p className="mt-3 text-sm text-slate-400">暂无运营中晒场</p>
          </div>
        )}
      </div>
    </div>
  );
}
