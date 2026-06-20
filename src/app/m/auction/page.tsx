import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { refreshAuctionProjectStatuses } from "@/lib/cron";
import { getDictMap } from "@/lib/dict";
import { Gavel } from "lucide-react";

export default async function MAuctionListPage() {
  try {
    await refreshAuctionProjectStatuses();
  } catch {
    /* DB unavailable during build or startup */
  }
  const projects = await prisma.auctionProject.findMany({
    where: { status: { in: ["SCHEDULED", "LIVE", "ENDED"] } },
    include: { asset: true },
    orderBy: { startsAt: "desc" },
    take: 50,
  });

  const auctionStatusMap = await getDictMap("auction_status");
  const statusCls: Record<string, string> = {
    LIVE: "status-live",
    SCHEDULED: "status-scheduled",
    ENDED: "status-ended",
  };

  return (
    <div className="animate-fade-in">
      <div className="gradient-header px-5 pb-10 pt-10">
        <h1 className="text-lg font-bold text-white">资产竞拍</h1>
        <p className="mt-1 text-xs text-blue-200">参与竞拍，赢取优质资产租赁权</p>
      </div>
      <div className="relative -mt-6 px-4">
        <div className="space-y-3">
          {projects.map((p, i) => {
            const st = { label: auctionStatusMap[p.status] ?? p.status, class: statusCls[p.status] ?? "status-ended" };
            return (
              <Link
                key={p.id}
                href={`/m/auction/${p.id}`}
                className={`card-elevated-lg block overflow-hidden transition-transform active:scale-[0.98] animate-slide-up stagger-${Math.min(i + 1, 5)}`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-bold text-slate-800">{p.asset.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{p.asset.locationText}</div>
                    </div>
                    <span className={`status-badge shrink-0 ${st.class}`}>{st.label}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <div>
                      <div className="text-[11px] text-slate-400">起拍价</div>
                      <div className="text-base font-bold text-blue-600">¥{p.startPrice.toString()}</div>
                    </div>
                    <div className="text-right text-[11px] text-slate-400">
                      {format(p.startsAt, "MM/dd HH:mm")} - {format(p.endsAt, "MM/dd HH:mm")}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
          {projects.length === 0 && (
            <div className="card-elevated py-12 text-center">
              <Gavel className="mx-auto h-10 w-10 text-slate-200" />
              <p className="mt-3 text-sm text-slate-400">暂无竞拍项目</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
