import type { Metadata } from "next";
import "./globals.css";
import { refreshAuctionProjectStatuses } from "@/lib/cron";

/** 构建镜像时无数据库；强制动态渲染避免 next build 阶段执行 Prisma */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "四师资产租赁",
  description: "资产竞拍与晒场预约",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  try {
    await refreshAuctionProjectStatuses();
  } catch {
    /* 构建或未就绪时忽略 */
  }
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
