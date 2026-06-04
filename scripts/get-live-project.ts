import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const project = await p.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (project) process.stdout.write(project.id);
  await p.$disconnect();
}

main().catch(() => process.exit(1));
