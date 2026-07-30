import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** 演示竞拍过期后自动续期为 LIVE，便于演示出价流程。 */
export async function refreshDemoAuctionIfExpired(db: PrismaClient = defaultPrisma) {
  const demoUser = await db.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return false;

  const reg = await db.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, depositPaid: true },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  const project = reg?.project;
  if (!project) return false;

  const now = new Date();
  if (project.status === "LIVE" && project.endsAt > now) return false;

  const starts = new Date(now.getTime() - 60_000);
  const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await db.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
  return true;
}
