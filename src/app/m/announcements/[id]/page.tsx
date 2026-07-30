import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Megaphone, ChevronLeft, Calendar } from "lucide-react";
import { sanitizeRichText } from "@/lib/html";

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a || a.status !== "PUBLISHED") notFound();
  return (
    <div className="animate-fade-in">
      <div className="gradient-header px-5 pb-12 pt-8">
        <Link href="/m" className="mb-3 inline-flex items-center gap-1 text-xs text-blue-200 hover:text-white">
          <ChevronLeft className="h-3.5 w-3.5" /> 返回首页
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
            <Megaphone className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white">{a.title}</h1>
        </div>
        {a.publishedAt && (
          <div className="mt-2 flex items-center gap-1 text-xs text-blue-200">
            <Calendar className="h-3 w-3" />
            {a.publishedAt.toISOString().slice(0, 10)}
          </div>
        )}
      </div>
      <div className="relative -mt-6 px-4">
        <div className="card-elevated-lg p-5 animate-slide-up">
          <div
            className="text-sm leading-relaxed text-slate-700 [&_p]:mb-3"
            dangerouslySetInnerHTML={{ __html: sanitizeRichText(a.content) }}
          />
        </div>
      </div>
    </div>
  );
}
