import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const projects = await p.auctionProject.findMany({
    select: { id: true, code: true, status: true, startsAt: true, endsAt: true },
  });
  console.log("Auction projects:", JSON.stringify(projects, null, 2));
  const now = new Date();
  console.log("Now:", now.toISOString());
}

main()
  .then(() => p.$disconnect())
  .catch((e) => {
    console.error(e);
    p.$disconnect();
    process.exit(1);
  });
