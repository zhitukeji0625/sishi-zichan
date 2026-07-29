import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const DEMO_USER_PHONE = "13800138000";

/** 将演示竞拍项目恢复为进行中，便于长期运行的开发/演示环境。 */
export async function refreshDemoAuctionWindow() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) {
    console.log("refreshDemoAuctionWindow: demo user missing, skip.");
    return;
  }

  let project = await prisma.auctionProject.findFirst({
    where: {
      registrations: {
        some: { endUserId: demoUser.id, status: "APPROVED", depositPaid: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!project) {
    project = await prisma.auctionProject.findFirst({
      orderBy: { createdAt: "desc" },
    });
  }

  if (!project) {
    console.log("refreshDemoAuctionWindow: no auction project, skip.");
    return;
  }

  const startsAt = new Date(Date.now() - 60 * 1000);
  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      status: "LIVE",
      startsAt,
      endsAt,
    },
  });

  await prisma.auctionRegistration.upsert({
    where: {
      projectId_endUserId: { projectId: project.id, endUserId: demoUser.id },
    },
    update: { status: "APPROVED", depositPaid: true },
    create: {
      projectId: project.id,
      endUserId: demoUser.id,
      status: "APPROVED",
      depositPaid: true,
    },
  });

  console.log(`refreshDemoAuctionWindow: project ${project.code} (${project.id}) is LIVE until ${endsAt.toISOString()}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  refreshDemoAuctionWindow()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      prisma.$disconnect();
      process.exit(1);
    });
}
