import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const p = new PrismaClient();
const project = await p.auctionProject.findFirst({
  where: { status: "LIVE" },
  select: { id: true, startPrice: true, bidStep: true },
});
let minBidAmount = null;
if (project) {
  const top = await p.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: "desc" },
  });
  const minNext = top
    ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
  minBidAmount = Number(minNext.toString());
}
const listing = await p.dryingFieldListing.findFirst({ where: { status: "OPERATING" }, select: { id: true } });
const org = await p.organization.findFirst({ where: { code: "CO101" }, select: { id: true } });
console.log(
  JSON.stringify({
    projectId: project?.id,
    minBidAmount,
    listingId: listing?.id,
    orgId: org?.id,
  }),
);
await p.$disconnect();
