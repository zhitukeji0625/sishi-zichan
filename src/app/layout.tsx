import type { Metadata } from "next";
import "./globals.css";
import { refreshAuctionProjectStatuses } from "@/lib/cron";

export const metadata: Metadata = {
  title: "四师资产租赁",
  description: "资产竞拍与晒场预约",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await refreshAuctionProjectStatuses();
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
