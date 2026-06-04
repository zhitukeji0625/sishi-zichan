/**
 * Integration tests against DB + lib (run: npx tsx scripts/integration-test.ts)
 */
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "../src/lib/auction";
import { validateReservationRange } from "../src/lib/drying";
import { refreshAuctionProjectStatuses } from "../src/lib/cron";

const prisma = new PrismaClient();
let failed = 0;

function ok(msg: string) {
  console.log(`  OK: ${msg}`);
}
function fail(msg: string) {
  console.error(`  FAIL: ${msg}`);
  failed++;
}

async function main() {
  console.log("=== Integration tests ===\n");

  await refreshAuctionProjectStatuses();
  ok("refreshAuctionProjectStatuses");

  const demo = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demo) {
    fail("demo user 13800138000 missing — run db:seed");
  } else {
    ok("demo user exists");
  }

  const org = await prisma.organization.findFirst({ where: { level: "COMPANY" } });
  if (!org) {
    fail("no company org");
    return;
  }

  const asset = await prisma.asset.create({
    data: {
      orgId: org.id,
      type: "LAND",
      name: "集成测试地块",
      locationText: "测试",
      status: "IDLE",
    },
  });

  const project = await prisma.auctionProject.create({
    data: {
      code: `IT${Date.now()}`,
      assetId: asset.id,
      startPrice: new Decimal(1000),
      bidStep: new Decimal(100),
      depositAmount: new Decimal(50),
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 86400000),
      status: "LIVE",
    },
  });

  if (demo) {
    await prisma.auctionRegistration.create({
      data: {
        projectId: project.id,
        endUserId: demo.id,
        status: "APPROVED",
        depositPaid: true,
      },
    });

    const bid = await placeBid({
      projectId: project.id,
      endUserId: demo.id,
      amount: new Decimal(1000),
    });
    if (bid.amount.toString() === "1000") ok("placeBid first bid");
    else fail(`placeBid amount ${bid.amount}`);

    try {
      await placeBid({
        projectId: project.id,
        endUserId: demo.id,
        amount: new Decimal(1050),
      });
      fail("placeBid should reject below min increment");
    } catch {
      ok("placeBid rejects low bid");
    }

    const bid2 = await placeBid({
      projectId: project.id,
      endUserId: demo.id,
      amount: new Decimal(1100),
    });
    if (bid2.amount.toString() === "1100") ok("placeBid increment");
    else fail("placeBid second bid");
  }

  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
  });
  if (listing) {
    const check = await validateReservationRange(
      listing.id,
      new Date("2026-12-01"),
      new Date("2026-12-02"),
    );
    if (check.ok) ok("validateReservationRange");
    else fail(`validateReservationRange: ${check.message}`);
  } else {
    fail("no operating drying listing");
  }

  await prisma.auctionBid.deleteMany({ where: { projectId: project.id } });
  await prisma.auctionRegistration.deleteMany({ where: { projectId: project.id } });
  await prisma.auctionProject.delete({ where: { id: project.id } });
  await prisma.asset.delete({ where: { id: asset.id } });

  console.log("");
  if (failed) {
    console.error(`=== ${failed} test(s) failed ===`);
    process.exit(1);
  }
  console.log("=== All integration tests passed ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
