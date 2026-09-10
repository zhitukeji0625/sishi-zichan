import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const cmd = process.argv[2];

try {
  if (cmd === "project-id") {
    const proj = await p.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
    process.stdout.write(proj?.id ?? "");
  } else if (cmd === "ensure-live") {
    const id = process.argv[3];
    await p.auctionProject.updateMany({
      where: { id },
      data: { status: "LIVE", endsAt: new Date(Date.now() + 7 * 86400000) },
    });
  } else if (cmd === "min-bid") {
    const id = process.argv[3];
    const proj = await p.auctionProject.findUnique({
      where: { id },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });
    const max = proj?.bids[0]?.amount
      ? Number(proj.bids[0].amount)
      : Number(proj?.startPrice ?? 0);
    const step = Number(proj?.bidStep ?? 200);
    process.stdout.write(String(max + step));
  } else if (cmd === "listing-id") {
    const l = await p.dryingFieldListing.findFirst();
    process.stdout.write(l?.id ?? "");
  }
} finally {
  await p.$disconnect();
}
