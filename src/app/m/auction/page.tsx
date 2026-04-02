import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";

export default async function MAuctionListPage() {
  const projects = await prisma.auctionProject.findMany({
    where: { status: { in: ["SCHEDULED", "LIVE", "ENDED"] } },
    include: { asset: true },
    orderBy: { startsAt: "desc" },
    take: 50,
  });

  return (
    <div className="px-4 pt-6">
      <h1 className="text-lg font-semibold text-slate-900">资产竞拍</h1>
      <div className="mt-4 space-y-3">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/m/auction/${p.id}`}
            className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="font-medium text-slate-900">{p.asset.name}</div>
            <div className="mt-1 text-xs text-slate-500">
              {format(p.startsAt, "MM-dd HH:mm")} — {format(p.endsAt, "MM-dd HH:mm")}
            </div>
            <div className="mt-2 text-sm text-blue-700">{p.status}</div>
          </Link>
        ))}
        {projects.length === 0 && <p className="text-sm text-slate-500">暂无竞拍项目</p>}
      </div>
    </div>
  );
}
