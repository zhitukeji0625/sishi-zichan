/**
 * 为集成测试准备 LIVE 竞拍项目（stdout: projectId startPrice listingId）
 */
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
    select: { id: true },
  });
  if (!listing) {
    console.error("no drying listing");
    process.exit(1);
  }

  const asset =
    (await prisma.asset.findFirst({ where: { status: "IDLE" } })) ??
    (await (async () => {
      const org = await prisma.organization.findFirst();
      if (!org) throw new Error("no org");
      return prisma.asset.create({
        data: {
          orgId: org.id,
          type: "LAND",
          name: "集成测试资产",
          locationText: "测试",
          status: "IDLE",
        },
      });
    })());
  const project = await createProject(asset.id);

  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (demoUser && project) {
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
  }

  const start = Number(project!.startPrice);
  console.log(`${project!.id} ${start} ${listing.id}`);
}

async function createProject(assetId: string) {
  const p = await prisma.auctionProject.create({
    data: {
      code: `IT${Date.now()}`,
      assetId,
      startPrice: new Decimal(8000),
      bidStep: new Decimal(200),
      depositAmount: new Decimal(500),
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "LIVE",
    },
    select: { id: true, startPrice: true },
  });
  return p;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
