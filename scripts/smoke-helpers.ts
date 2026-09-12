import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cmd = process.argv[2];
  if (cmd === "live-project") {
    const proj = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });
    if (!proj) {
      console.log("");
      return;
    }
    const top = proj.bids[0]?.amount ?? proj.startPrice;
    const min = Number(top) + Number(proj.bidStep);
    console.log(`${proj.id} ${min}`);
    return;
  }
  if (cmd === "drying-listing") {
    const l = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
    console.log(l?.id ?? "");
    return;
  }
  if (cmd === "ensure-registration") {
    const [projectId, phone] = process.argv.slice(3);
    const user = await prisma.endUser.findFirst({ where: { phone } });
    if (user && projectId) {
      await prisma.auctionRegistration.upsert({
        where: { projectId_endUserId: { projectId, endUserId: user.id } },
        update: { status: "APPROVED", depositPaid: true },
        create: { projectId, endUserId: user.id, status: "APPROVED", depositPaid: true },
      });
    }
    return;
  }
  console.error("Unknown command:", cmd);
  process.exit(1);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
