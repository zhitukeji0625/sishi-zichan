import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function MDryingListPage() {
  const listings = await prisma.dryingFieldListing.findMany({
    where: { status: "OPERATING" },
    include: { asset: true },
  });

  return (
    <div className="px-4 pt-6">
      <h1 className="text-lg font-semibold text-slate-900">晒场预约</h1>
      <div className="mt-4 space-y-3">
        {listings.map((l) => (
          <Link
            key={l.id}
            href={`/m/drying/${l.id}`}
            className="block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="aspect-video bg-slate-100" />
            <div className="p-4">
              <div className="font-medium text-slate-900">{l.asset.name}</div>
              <div className="mt-1 text-xs text-slate-500">{l.asset.locationText}</div>
            </div>
          </Link>
        ))}
        {listings.length === 0 && <p className="text-sm text-slate-500">暂无运营中晒场</p>}
      </div>
    </div>
  );
}
