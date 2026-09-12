import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const mode = process.argv[2];

async function auction() {
  const proj = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
  });
  if (!proj) {
    console.log("");
    console.log("0");
    return;
  }
  const top = proj.bids[0]?.amount;
  const min = top
    ? Number(top) + Number(proj.bidStep)
    : Number(proj.startPrice);
  console.log(proj.id, min);
}

async function drying() {
  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
  });
  const start = new Date();
  start.setDate(start.getDate() + 10);
  const end = new Date();
  end.setDate(end.getDate() + 11);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  console.log(listing?.id ?? "", fmt(start), fmt(end));
}

(async () => {
  try {
    if (mode === "auction") await auction();
    else if (mode === "drying") await drying();
    else console.error("Usage: smoke-helpers.ts auction|drying");
  } finally {
    await prisma.$disconnect();
  }
})();
