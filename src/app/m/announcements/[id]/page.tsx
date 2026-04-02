import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a || a.status !== "PUBLISHED") notFound();
  return (
    <div className="px-4 pt-6">
      <Link href="/m" className="text-sm text-blue-700">← 返回首页</Link>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">{a.title}</h1>
      <div
        className="mt-4 space-y-2 text-sm leading-relaxed text-slate-700 [&_p]:mb-2"
        dangerouslySetInnerHTML={{ __html: a.content }}
      />
    </div>
  );
}
