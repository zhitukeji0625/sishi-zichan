import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const p = await prisma.auctionProject.findFirst({
  where: { status: "LIVE" },
  orderBy: { createdAt: "desc" },
});
console.log(p?.id ?? "");
await prisma.$disconnect();
